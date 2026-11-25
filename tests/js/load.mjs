// Loads the panel (with the shared core it imports) into a vm context without a browser and returns the named
// top-level bindings. The ES module import/export lines are dropped: both files run as one script.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (name) => readFileSync(new URL(`../../custom_components/shared_diet/frontend/${name}`, import.meta.url), "utf8");

export const coreSource = () => read("shared-diet-core.js").replace(/^export \{[\s\S]*?\};$/m, "");

export function loadPanel(ctx, names) {
  const panel = read("shared-diet-panel.js").replace(/^import \{[\s\S]*?\} from "\.\/shared-diet-core\.js";$/m, "");
  vm.createContext(ctx);
  return vm.runInContext(`${coreSource()}\n${panel}\n;({ ${names.join(", ")} });`, ctx);
}
