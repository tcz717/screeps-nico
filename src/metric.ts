import { AI_CONFIG } from "config";
import _ from "lodash";
import { Corps } from "corps";
import { isIdle, getResourceAmount, Storable, isStorage } from "utils/helper";

export function recordMineDuration(source: Source, duration: number) {
    source.room.memory.sources[source.id] += AI_CONFIG.sourceLearningRate * (duration - source.room.memory.sources[source.id]);
}

export function recordHeatMap(pos: RoomPosition) {
    const idx = (pos.x * 50 + pos.y).toString();
    const heat = _.get(Memory.rooms, [pos.roomName, "heatMap", idx], 0);
    _.setWith(Memory.rooms, [pos.roomName, "heatMap", idx], heat + 1, Object);
}

function recordTotalEnergy(corps: Corps) {
    const total = _(corps.creeps).sumBy('carry.energy') + _(corps.storables).map(s => getResourceAmount(s, RESOURCE_ENERGY)).sum();
    return total;
}

function updateHeatMap(corps: Corps) {
    const max = _(corps.baseRoom.memory.heatMap).values().max() || 0;
    if (max > 1000) {
        const ratio = 1000 / max;
        (corps.baseRoom.memory.heatMap as any) = _(corps.baseRoom.memory.heatMap).mapValues(n => _.floor(n * ratio)).pickBy().value();
    }
}

export function updateCorpsMetric(corps: Corps) {
    const time = Game.time;
    if (time % 5 == 0) {
        const total = recordTotalEnergy(corps);
        const diff = total - getTotalEnergy(corps);
        _.set(corps.memory, 'energy', total);
        console.log(`[${corps.name}] total energy: ${total} net profit: ${diff}`)

        const idleNum = _(corps.creeps).filter(isIdle).value().length;
        console.log(`[${corps.name}] idle: ${idleNum}, queue: ${corps.memory.taskQueue.length} ${JSON.stringify(_(corps.roles).mapValues('length').value())}`);
    }
    if (time % 113 == 0) {
        updateHeatMap(corps);
    }
}

export function getTotalEnergy(corps: Corps): number {
    return _.get(corps.memory, 'energy', 0);
}
