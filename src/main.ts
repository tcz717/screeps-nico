import { ErrorMapper } from "utils/ErrorMapper";
import { NicoAI } from "./NicoAI";

export const loop = ErrorMapper.wrapLoop(() => {
  var ai = NicoAI.load(Memory);
  
  ai.update();

  ai.save();
});
