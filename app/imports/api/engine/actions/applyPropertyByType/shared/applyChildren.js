import { applyNodeTriggers } from '/imports/api/engine/actions/applyTriggers.js';
import applyProperty from '/imports/api/engine/actions/applyProperty.js';

export default async function applyChildren(node, actionContext) {
  applyNodeTriggers(node, 'after', actionContext);
  for (const child of node.children) {
    await applyProperty(child, actionContext);
  }
  applyNodeTriggers(node, 'afterChildren', actionContext);
}
