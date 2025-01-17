import { get } from 'lodash';

import { EngineAction } from '/imports/api/engine/action/EngineActions';
import { PropTask } from '/imports/api/engine/action/tasks/Task';
import { getPropertyDescendants } from '/imports/api/engine/loadCreatures';
import resolve from '/imports/parser/resolve';
import map from '/imports/parser/map';
import toString from '/imports/parser/toString';
import computedSchemas from '/imports/api/properties/computedOnlyPropertySchemasIndex.js';
import applyFnToKey, { applyFnToKeyAsync } from '/imports/api/engine/computation/utility/applyFnToKey';
import accessor from '/imports/parser/parseTree/accessor';
import TaskResult, { Mutation } from '/imports/api/engine/action/tasks/TaskResult';
import { getEffectiveActionScope } from '/imports/api/engine/action/functions/getEffectiveActionScope';
import cyrb53 from '/imports/api/engine/computation/utility/cyrb53';
import { renewDocIds } from '/imports/api/parenting/parentingFunctions';
import { cleanProps } from '/imports/api/creature/creatureProperties/methods/copyPropertyToLibrary';
import recalculateInlineCalculations from '/imports/api/engine/action/functions/recalculateInlineCalculations';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import INLINE_CALCULATION_REGEX from '/imports/constants/INLINE_CALCULATION_REGEX';
import { applyAfterTasksSkipChildren } from '/imports/api/engine/action/functions/applyTaskGroups';
import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';

export default async function applyBuffProperty(
  task: PropTask, action: EngineAction, result: TaskResult, userInput: InputProvider
) {
  const prop = EJSON.clone(task.prop);
  const targetIds = prop.target === 'self' ? [action.creatureId] : task.targetIds;

  // Get the buff and its descendants
  const propList = [
    EJSON.clone(prop),
    ...getPropertyDescendants(action.creatureId, prop._id),
  ];

  // Crystalize the variables
  if (!prop.skipCrystalization) {
    await crystalizeVariables(action, propList, task, result);
  }

  targetIds.forEach(target => {
    // Create a per-target mutation
    const mutation: Mutation = { targetIds: [target], contents: [] };

    // Create a per-target copy of the propList
    let targetPropList = EJSON.clone(propList);

    // Give the properties new IDs as descendants of the target
    renewDocIds({
      docArray: targetPropList,
      idMap: {
        [prop.parentId]: null,
        [prop.root.id]: target,
      },
      collectionMap: { [prop.root.collection]: 'creatures' }
    });

    //Log the buff
    let logValue = prop.description?.value
    if (prop.description?.text) {
      recalculateInlineCalculations(prop.description, action, 'reduce', userInput);
      logValue = prop.description?.value;
    }
    result.appendLog({
      name: getPropertyTitle(prop),
      value: logValue,
      silenced: prop.silent,
    }, [target]);

    // remove all the computed fields
    targetPropList = cleanProps(targetPropList);

    // Insert the props in the mutation
    mutation.inserts = targetPropList;

    // Add the mutation to the results
    result.mutations.push(mutation);
  });
  applyAfterTasksSkipChildren(action, prop, targetIds, userInput);
}

/**
 * Replaces all variables with their resolved values
 * except variables of the form `~target.thing.total` become `thing.total`
 */
async function crystalizeVariables(
  action: EngineAction, propList: any[], task: PropTask, result: TaskResult
) {
  const scope = await getEffectiveActionScope(action);
  for (const prop of propList) {
    if (prop._skipCrystalize) {
      delete prop._skipCrystalize;
      return;
    }
    // Iterate through all the calculations and crystalize them
    for (const calcKey of computedSchemas[prop.type].computedFields()) {
      await applyFnToKeyAsync(prop, calcKey, async (prop, key) => {
        const calcObj = get(prop, key);
        if (!calcObj?.parseNode) return;
        calcObj.parseNode = await map(calcObj.parseNode, async node => {
          // Skip nodes that aren't symbols or accessors
          if (
            node.parseType !== 'accessor'
          ) return node;
          // Handle variables
          if (node.parseType === 'accessor' && node.name === '~target') {
            // strip ~target
            if (node.path?.length > 0) {
              const name = node.path.shift();
              return accessor.create({
                name,
                path: node.path?.length ? node.path : undefined,
              });
            } else {
              // Can't strip if there isn't anything in the path after ~target
              result.appendLog({
                name: 'Error',
                value: 'Variable `~target` should not be used without a property: ~target.property',
                silenced: prop.silent,
              }, task.targetIds);
            }
            return node;
          } else {
            // Resolve all other variables
            const { result: nodeResult, context } = await resolve('reduce', node, scope);
            result.appendParserContextErrors(context, task.targetIds);
            return nodeResult;
          }
        });
        calcObj.calculation = toString(calcObj.parseNode);
        calcObj.hash = cyrb53(calcObj.calculation);
      });
    }
    // For each key in the schema
    for (const calcKey of computedSchemas[prop.type].inlineCalculationFields()) {
      // That ends in .inlineCalculations
      applyFnToKey(prop, calcKey, (prop, key) => {
        const inlineCalcObj = get(prop, key);
        if (!inlineCalcObj) return;

        // If there is no text, skip
        if (!inlineCalcObj.text) {
          return;
        }

        // Replace all the existing calculations
        let index = -1;
        inlineCalcObj.text = inlineCalcObj.text.replace(INLINE_CALCULATION_REGEX, () => {
          index += 1;
          return `{${inlineCalcObj.inlineCalculations[index].calculation}}`;
        });

        // Set the value to the uncomputed string
        inlineCalcObj.value = inlineCalcObj.text;

        // Write a new hash
        const inlineCalcHash = cyrb53(inlineCalcObj.text);
        if (inlineCalcHash === inlineCalcObj.hash) {
          // Skip if nothing changed
          return;
        }
        inlineCalcObj.hash = inlineCalcHash;
      });
    }
  }
}
