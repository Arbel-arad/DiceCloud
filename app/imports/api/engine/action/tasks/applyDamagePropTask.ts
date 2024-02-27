import { EngineAction } from '/imports/api/engine/action/EngineActions';
import { DamagePropTask } from '/imports/api/engine/action/tasks/Task';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import { applyTriggers } from '/imports/api/engine/action/functions/applyTaskGroups';
import { getEffectiveActionScope } from '/imports/api/engine/action/functions/getEffectiveActionScope';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import { getSingleProperty } from '/imports/api/engine/loadCreatures';
import numberToSignedString from '/imports/api/utility/numberToSignedString';

export default async function applyDamagePropTask(
  task: DamagePropTask, action: EngineAction, result: TaskResult, userInput
): Promise<number> {

  const prop = task.prop;

  if (task.targetIds.length > 1) {
    throw 'This subtask can only be called on a single target';
  }
  const targetId = task.targetIds[0];

  let { value } = task.params;
  const { title, operation } = task.params;
  let targetProp = task.params.targetProp;

  // Set the scope properties
  result.pushScope = {};
  if (operation === 'increment') {
    if (value >= 0) {
      result.pushScope['~damage'] = { value };
    } else {
      result.pushScope['~healing'] = { value: -value };
    }
  } else {
    result.pushScope['~set'] = { value };
  }
  // Store which property we're targeting
  if (targetId === action.creatureId) {
    result.pushScope['~attributeDamaged'] = { _propId: targetProp._id };
  } else {
    result.pushScope['~attributeDamaged'] = targetProp;
  }

  // Run the before triggers which may change scope properties
  await applyTriggers(action, targetProp, [action.creatureId], 'damageProperty.before', userInput);

  // Refetch the scope properties
  const scope = await getEffectiveActionScope(action);
  result.popScope = {
    '~damage': 1, '~healing': 1, '~set': 1, '~attributeDamaged': 1,
  };
  value = +value;
  if (operation === 'increment') {
    if (value >= 0) {
      value = scope['~damage']?.value;
    } else {
      value = -scope['~healing']?.value;
    }
  } else {
    value = scope['~set']?.value;
  }
  const targetPropId = scope['~attributeDamaged']?._propId;

  // If there are no targets, just log the result that would apply and end
  if (!task.targetIds?.length) {
    // Get the locally equivalent stat with the same variable name
    const statName = getPropertyTitle(targetProp);
    result.appendLog({
      name: title,
      value: `${statName}${operation === 'set' ? ' set to' : ''}` +
        ` ${value}`,
      inline: true,
      ...prop.silent && { silenced: true },
    }, task.targetIds);
  }

  let damage, newValue, increment;
  targetProp = await getSingleProperty(targetId, targetPropId);

  if (!targetProp) return value;

  if (operation === 'set') {
    const total = targetProp.total || 0;
    // Set represents what we want the value to be after damage
    // So we need the actual damage to get to that value
    damage = total - value;
    // Damage can't exceed total value
    if (damage > total && !targetProp.ignoreLowerLimit) damage = total;
    // Damage must be positive
    if (damage < 0 && !targetProp.ignoreUpperLimit) damage = 0;
    newValue = targetProp.total - damage;
    // Write the results
    result.mutations.push({
      targetIds: [targetId],
      updates: [{
        propId: targetProp._id,
        set: { damage, value: newValue },
        type: targetProp.type,
      }],
      contents: [{
        name: title,
        value: `${getPropertyTitle(targetProp)} set to ${value}`,
        inline: true,
        ...prop.silent && { silenced: true },
      }]
    });
  } else if (operation === 'increment') {
    const currentValue = targetProp.value || 0;
    const currentDamage = targetProp.damage || 0;
    increment = value;
    // Can't increase damage above the remaining value
    if (increment > currentValue && !targetProp.ignoreLowerLimit) increment = currentValue;
    // Can't decrease damage below zero
    if (-increment > currentDamage && !targetProp.ignoreUpperLimit) increment = -currentDamage;
    damage = currentDamage + increment;
    newValue = targetProp.total - damage;
    // Write the results
    result.mutations.push({
      targetIds: [targetId],
      updates: [{
        propId: targetProp._id,
        inc: { damage: increment, value: -increment },
        type: targetProp.type,
      }],
      contents: [{
        name: 'Attribute damaged',
        value: `${numberToSignedString(-value)} ${getPropertyTitle(targetProp)}`,
        inline: true,
        ...prop.silent && { silenced: true },
      }]
    });
  }
  await applyTriggers(action, prop, [action.creatureId], 'damageProperty.after', userInput);
  return increment;
}