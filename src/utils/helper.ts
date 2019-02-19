import _ from "lodash";


export function surrounding(x: number, y: number): Array<[number, number]> {
    return [
        [x + 1, y], [x - 1, y], [x + 1, y + 1], [x - 1, y + 1],
        [x + 1, y - 1], [x - 1, y - 1], [x, y + 1], [x, y - 1]
    ]
}
export function surroundingPos(pos: RoomPosition): Array<RoomPosition> {
    return _([
        [pos.x + 1, pos.y], [pos.x - 1, pos.y], [pos.x + 1, pos.y + 1], [pos.x - 1, pos.y + 1],
        [pos.x + 1, pos.y - 1], [pos.x - 1, pos.y - 1], [pos.x, pos.y + 1], [pos.x, pos.y - 1],
        [pos.x, pos.y]
    ])
        .filter(p => _.inRange(p[0], 50) && _.inRange(p[1], 50))
        .map(p => new RoomPosition(p[0], p[1], pos.roomName))
        .value();
}

export function buildable(pos: RoomPosition) {
    return !_.some(pos.look(),
        _.overSome(
            _.matchesProperty('type', "structure"),
            _.matchesProperty('type', "constructionSite"),
            _.matches({ type: "terrain", terrain: "wall" })
        ));
}
export function walkable(pos: RoomPosition) {
    return !_.some(pos.look(),
        _.overSome(
            _.overEvery(
                _.matchesProperty('type', "structure"),
                _.negate(_.matchesProperty(['structure', "structureType"], STRUCTURE_ROAD))
            ),
            _.matchesProperty('type', "creep"),
            _.matches({ type: "terrain", terrain: "wall" })
        ));
}