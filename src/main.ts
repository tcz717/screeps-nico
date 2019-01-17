import { ErrorMapper } from "utils/ErrorMapper";
import { NicoAI } from "./NicoAI";

export const loop = ErrorMapper.wrapLoop(() => {
  var ai = new NicoAI();

  ai.update();
});
