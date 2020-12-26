import _, { Dictionary } from "lodash";


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

export function isIdle(creep: Creep): boolean {
    return !creep.spawning && !creep.memory.task;
}


export type EnergyContainer = StructureExtension | StructureSpawn | StructureTower;
export type Storable = StructureContainer | StructureStorage | StructureLink;
export function getResourceAmount(struct: Structure | Tombstone | Ruin | null | undefined, resource: ResourceConstant): number {
    if (struct instanceof StructureLink && resource == RESOURCE_ENERGY)
        return struct.energy;
    return _.get(struct, ["store", resource], 0);
}
export function getResourceTotal(struct: Structure | Tombstone | null | undefined): number {
    if (struct instanceof StructureLink)
        return struct.energy;
    return _(_.get(struct, "store", {})).values().sum();
}
export function getResource(struct: Structure | Tombstone | null | undefined): Dictionary<number> {
    if (struct instanceof StructureLink)
        return { [RESOURCE_ENERGY]: struct.energy };
    return _.pickBy(_.get(struct, "store", {}));
}
export function getResourceCapacity(struct: Structure | null | undefined): number {
    if (struct instanceof StructureLink)
        return struct.energyCapacity;
    return _.get(struct, "storeCapacity", 0);
}
export function isEnergyContainer(target: Structure | null): target is EnergyContainer {
    const energyRequired: string[] = [STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER];
    return target && energyRequired.includes(target.structureType) || false;
}
export function isStorage(target: Structure | null): target is Storable {
    return target instanceof StructureContainer || target instanceof StructureStorage || target instanceof StructureLink;
}
export function isMineralStorage(target: Structure | null): target is Storable {
    return target instanceof StructureContainer || target instanceof StructureStorage;
}
export function isMineable(sourceId: string | undefined) {
    const source = Game.getObjectById<RoomObject>(sourceId as Id<RoomObject>);
    if (source instanceof Source)
        return source.energy > 0;
    else if (source instanceof Mineral)
        return source.mineralAmount > 0;
    return false;
}
export function isStorable(struct: Structure | null | undefined): struct is Storable {
    return getResourceTotal(struct) < getResourceCapacity(struct);
}
export function isLoadable(struct: Structure | Tombstone | Ruin | null, resource: ResourceConstant): struct is Storable | Ruin {
    if ((struct instanceof StructureSpawn) || (struct instanceof StructureExtension) || struct instanceof StructureTower) {
        return false;
    }
    return getResourceAmount(struct, resource) > 0;
}
export function isLoadableAny(struct: Structure | Tombstone | null): boolean {
    return getResourceTotal(struct) > 0;
}
export function isLoadableContainer(struct: Structure | null, resource: ResourceConstant): boolean {
    return (struct instanceof StructureContainer || struct instanceof StructureLink) && isLoadable(struct, resource);
}
export function isLoadableContainerAny(struct: Structure | null): boolean {
    return (struct instanceof StructureContainer || struct instanceof StructureLink) && isLoadableAny(struct);
}

export function isExtractor(s: AnyOwnedStructure): boolean {
    return s instanceof StructureExtractor && s.pos.lookFor(LOOK_MINERALS)[0].mineralAmount > 0;;
}

export function posToStr(pos: RoomPosition): string {
    return pos.x + "," + pos.y;
}
