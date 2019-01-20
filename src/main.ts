import { Corps } from "corps";
import _ from "lodash";
import { DefaultPolicySet } from "policy";
import { ErrorMapper } from "utils/ErrorMapper";

// export const loop = 'sim' in Game.rooms ? _loop : ErrorMapper.wrapLoop(_loop);
export const loop = ErrorMapper.wrapLoop(_loop);
function _loop() {
  if (_.isEmpty(Memory.corps))
    initCorps();

  _(Memory.corps).keys().forEach(name => {
    const corps = new Corps(name);
    corps.update(DefaultPolicySet);
  });
}

function initCorps(): void {
  Memory.corps = {};
  for (const name in Game.spawns) {
    const spawn = Game.spawns[name];
    const corps = Corps.createBySpawn(`Corps-${spawn.pos.roomName}`, spawn);
    Memory.corps[corps.name] = corps;
  }
}
