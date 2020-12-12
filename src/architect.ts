import { Corps } from "corps";
import { Policy } from "policy";
import { Dictionary } from "lodash";
import _ from "lodash";
import { surrounding, surroundingPos, buildable, isStorage } from "utils/helper";
import { AI_CONFIG } from "config";

type BlueprintGenerator = (corps: Corps) => Blueprint
type Locator = (corps: Corps) => RoomPosition

/** 合并两个蓝图生成器 */
function Combine(...blueprintGenerators: BlueprintGenerator[]): BlueprintGenerator {
    return function (corps): Blueprint {
        return _.flatMap(blueprintGenerators, (g: BlueprintGenerator): Blueprint => g(corps));
    }
}

/** 生成连接两个点的道路 */
function BuildRoad(src: Locator, dest: Locator): BlueprintGenerator {
    return function (corps: Corps): Blueprint {
        const s = src(corps);
        const d = dest(corps);
        const path = s.findPathTo(d, {
            ignoreCreeps: true,
            range: 1,
            swampCost: 1,
            plainCost: 1,
        });
        return path.map(p => ({
            type: STRUCTURE_ROAD,
            pos: new RoomPosition(p.x, p.y, corps.baseRoom.name)
        }));
    }
}

/** 生成含有五个Extension的建筑群 */
function BuildExtensionGroup() {
    return function (corps: Corps): Blueprint {
        var p = searchBlock(corps, 3)!;

        console.log(`Choice ${p} as ExtensionGroup`)
        return [
            { type: STRUCTURE_EXTENSION, pos: p },
            { type: STRUCTURE_EXTENSION, pos: corps.baseRoom.getPositionAt(p.x - 1, p.y - 1)! },
            { type: STRUCTURE_EXTENSION, pos: corps.baseRoom.getPositionAt(p.x - 2, p.y)! },
            { type: STRUCTURE_EXTENSION, pos: corps.baseRoom.getPositionAt(p.x, p.y - 2)! },
            { type: STRUCTURE_EXTENSION, pos: corps.baseRoom.getPositionAt(p.x - 2, p.y - 2)! },
            { type: STRUCTURE_ROAD, pos: corps.baseRoom.getPositionAt(p.x - 1, p.y)! },
            { type: STRUCTURE_ROAD, pos: corps.baseRoom.getPositionAt(p.x, p.y - 1)! },
            { type: STRUCTURE_ROAD, pos: corps.baseRoom.getPositionAt(p.x - 2, p.y - 1)! },
            { type: STRUCTURE_ROAD, pos: corps.baseRoom.getPositionAt(p.x - 1, p.y - 2)! },
        ];
    }
}

/** 建造主存储 */
function BuildStorage() {
    return function (corps: Corps): Blueprint {
        var p = searchBlock(corps, 2)!;

        console.log(`Choice ${p} as Storage`)
        return [
            { type: STRUCTURE_STORAGE, pos: p },
            { type: STRUCTURE_ROAD, pos: corps.baseRoom.getPositionAt(p.x, p.y - 1)! },
            { type: STRUCTURE_ROAD, pos: corps.baseRoom.getPositionAt(p.x - 1, p.y)! },
        ];
    }
}
/** 建造塔楼 */
function BuildTower(center: Locator = FindSpawn) {
    return function (corps: Corps): Blueprint {
        var p = searchBlock(corps, 1, center)!;

        console.log(`Choice ${p} as Tower`)
        return [
            { type: STRUCTURE_TOWER, pos: p },
        ];
    }
}
/** 建造塔楼 */
function BuildLink(pos: Locator) {
    return function (corps: Corps): Blueprint {
        var p = pos(corps);

        console.log(`Choice ${p} as Tower`)
        return [
            { type: STRUCTURE_LINK, pos: p },
        ];
    }
}

function Build(pos: Locator, building: BuildableStructureConstant) {
    return function (corps: Corps): Blueprint {
        var p = pos(corps);

        console.log(`Choice ${p} as ${building}`)
        return [
            { type: building, pos: p },
        ];
    }
}
/** 建造塔楼 */
function BuildSourceLink() {
    return function (corps: Corps): Blueprint {
        const source = _(corps.baseRoom.find(FIND_SOURCES))
            .filter((s: Source) => s.pos.findInRange(FIND_STRUCTURES, 2, { filter: isStorage }).length == 0)
            .maxBy(s => s.pos.getRangeTo(corps.baseRoom.storage!))

        console.log(`Choice ${source} as SourceLink`)
        if (source)
            return [
                { type: STRUCTURE_LINK, pos: WithRange(() => source.pos, 2)(corps) },
            ];
        else
            return []
    }
}

/** 在目的地一定距离的地方放一个中转的container */
function BuildRelayStation(src: Locator, dst: Locator, range = 10): BlueprintGenerator {
    return function (corps: Corps): Blueprint {
        const s = src(corps);
        const d = dst(corps);
        const path = s.findPathTo(d, {
            ignoreCreeps: true,
        });
        const pos = path[path.length / 2 > range ? path.length - range : path.length >> 1];
        return [{
            type: STRUCTURE_CONTAINER,
            pos: new RoomPosition(pos.x, pos.y, corps.baseRoom.name)
        }];
    }
}

function Cover(center: Locator, sturct: BuildableStructureConstant): BlueprintGenerator {
    return function (corps: Corps): Blueprint {
        const ps = surroundingPos(center(corps)).filter(buildable);
        return ps.map(p => ({
            type: sturct,
            pos: p
        }))
    }
}

function HeatmapRoadUpdate(baseProject?: string): BlueprintGenerator {
    return function (corps: Corps): Blueprint {
        const maxHeat = _(corps.baseRoom.memory.heatMap).values().max() || 1;
        const map = getBuildMap(corps);
        const hotPoints: Blueprint = _(corps.baseRoom.memory.heatMap)
            .mapValues(h => h / maxHeat)
            .pickBy((h, p) => {
                const _p = parseInt(p);
                return h > AI_CONFIG.heatmapRoadRatio && map[~~(_p / 50)][_p % 50] > 0;
            })
            .keys()
            .map(i => ({ pos: indexToPosition(corps.baseRoom, parseInt(i)), type: STRUCTURE_ROAD }))
            .value();
        if (baseProject) {
            corps.memory.blueprints[baseProject].push(...hotPoints);
            return []
        }
        return hotPoints;
    }
}
function WithRange(center: Locator, range: number): Locator {
    return (corps: Corps): RoomPosition => {
        const mat = getBuildMap(corps);
        const s = center(corps);
        const visited = _.times(50, () => _.times(50, _.constant(0)));
        const next: [number, number][] = [[s.x, s.y]];

        var count = 0
        var p: [number, number] | undefined = undefined;
        while (next.length) {
            p = next.shift()!;
            console.log(p, count++, next.length)
            if (mat[p[0]][p[1]] >= 1 && s.getRangeTo(p[0], p[1]) == range)
                return corps.baseRoom.getPositionAt(p[0], p[1])!;
            next.push(..._(surrounding(p[0], p[1]))
                .filter(pos => visited[pos[0]][pos[1]]++ == 0)
                .value());
        }
        throw `WithRange not found in ${s}, ${range}`;
    }
}
function CloseTo(center: Locator): Locator {
    return (corps: Corps): RoomPosition => searchBlock(corps, 1, center)!;
}
/** 获取一个spawn */
function FindSpawn(corps: Corps): RoomPosition {
    return corps.baseRoom.find(FIND_MY_SPAWNS)[0].pos
}
function FindController(c: Corps): RoomPosition {
    return c.baseRoom.controller!.pos;
}
/** 对每个source执行操作 */
function ToEverySource(generator: { (src: Locator, dest: Locator): BlueprintGenerator }, src: Locator = FindSpawn) {
    return (corps: Corps) => _(corps.baseRoom.find(FIND_SOURCES))
        .flatMap(s => generator(src, () => s.pos)(corps))
        .value()
}
/** 对每个source执行操作 */
function AtEverySource(generator: { (pos: Locator, ...args: any[]): BlueprintGenerator }, ...args: any[]) {
    return (corps: Corps) => _(corps.baseRoom.find(FIND_SOURCES))
        .flatMap(s => generator(() => s.pos, ...args)(corps))
        .value()
}
/** 对每个source执行操作 */
function AtEveryMineral(generator: { (pos: Locator, ...args: any[]): BlueprintGenerator }, ...args: any[]) {
    return (corps: Corps) => _(corps.baseRoom.find(FIND_MINERALS))
        .flatMap(s => generator(() => s.pos, ...args)(corps))
        .value()
}

/** 检测某个project是否已完成 */
function Finished(required: string | Array<string>): Premiss {
    if (typeof required == "string")
        return (project: Project, corps: Corps, finished: Set<string>) => finished.has(required);
    else
        return (project: Project, corps: Corps, finished: Set<string>) => _.every(required, finished.has.bind(finished));
}

/** 检测controller是否已经到达指定等级 */
function Level(level: number): Premiss {
    return (project: Project, corps: Corps, finished: Set<string>) => corps.baseRoom.controller!.level >= level;
}

function indexToPosition(room: Room, index: number): RoomPosition {
    return room.getPositionAt(~~(index / 50), index % 50)!;
}
function getBuildMap(corps: Corps) {
    const mat = _.times(50, () => _.times(50, _.constant(0)));

    const map = corps.baseRoom.lookAtArea(0, 0, 49, 49);
    for (var i = 1; i < 50; ++i) {
        for (var j = 1; j < 50; ++j) {
            const blocked = _.some(map[j][i],
                _.overSome(
                    _.matchesProperty('type', "structure"),
                    _.matchesProperty('type', "constructionSite"),
                    _.matches({ type: "terrain", terrain: "wall" })
                ));
            mat[i][j] = blocked ? 0 : _.min([mat[i - 1][j - 1], mat[i - 1][j], mat[i][j - 1]])! + 1;
        }
    }
    return mat;
}
function searchBlock(corps: Corps, size: number, start: Locator = FindSpawn): RoomPosition | null {
    const mat = getBuildMap(corps);
    // console.log(JSON.stringify(mat))
    const s = start(corps);
    const visited = _.times(50, () => _.times(50, _.constant(0)));
    const next: [number, number][] = [[s.x, s.y]];

    var count = 0
    var p: [number, number] | undefined = undefined;
    while (next.length) {
        p = next.shift()!;
        console.log(p, mat[p[0]][p[1]], count++, next.length)
        if (mat[p[0]][p[1]] >= size)
            return corps.baseRoom.getPositionAt(p[0], p[1]);
        next.push(..._(surrounding(p[0], p[1]))
            .filter(pos => visited[pos[0]][pos[1]]++ == 0)
            .value());
    }
    return null;
}
function bindPos(blueprint: Blueprint) {
    blueprint.forEach(node =>
        node.pos = new RoomPosition(node.pos.x, node.pos.y, node.pos.roomName));
}
function isCompete(blueprint: Blueprint): boolean {
    return blueprint.completed || _.every(blueprint, (node: Node) => {
        if (Game.getObjectById(node.id))
            return true;
        const structs = node.pos.findInRange(FIND_STRUCTURES, 0, { filter: (s: AnyStructure) => s.structureType == node.type });
        node.id = _.get(structs, [0, "id"]);
        return structs.length;
    })
}
function mark(blueprint: Blueprint): void {
    _.forEach(blueprint, n => {
        if (Game.getObjectById(n.id))
            return;
        const result = n.pos.createConstructionSite(n.type);
    })
}

interface Project {
    premiss: Array<Premiss>,
    design: BlueprintGenerator;
}
type Premiss = (project: Project, corps: Corps, finished: Set<string>) => boolean;
type Projects = Dictionary<Project>;
export const StandernProjects: Projects = {
    road: {
        premiss: [Level(2)],
        design: ToEverySource(BuildRoad)
    },
    roadController: {
        premiss: [],
        design: BuildRoad(FindSpawn, FindController),
    },
    roadControllerSource: {
        premiss: [Level(2), Finished(["road", "roadController"])],
        design: ToEverySource(BuildRoad, FindController)
    },
    keyStructRoadCover: {
        premiss: [Finished("roadControllerSource")],
        design: Combine(AtEverySource(Cover, STRUCTURE_ROAD), Cover(FindController, STRUCTURE_ROAD), Cover(FindSpawn, STRUCTURE_ROAD))
    },
    extension1: {
        premiss: [Finished("keyStructRoadCover"), Level(2)],
        design: BuildExtensionGroup()
    },
    extension2: {
        premiss: [Finished("extension1"), Level(3)],
        design: BuildExtensionGroup()
    },
    extension3: {
        premiss: [Finished("extension2"), Level(4)],
        design: BuildExtensionGroup()
    },
    extension4: {
        premiss: [Finished("extension3"), Level(4)],
        design: BuildExtensionGroup()
    },
    extension5: {
        premiss: [Finished("extension4"), Level(5)],
        design: BuildExtensionGroup()
    },
    extension6: {
        premiss: [Finished("extension5"), Level(5)],
        design: BuildExtensionGroup()
    },
    sourceRelay: {
        premiss: [Finished("road"), Level(3)],
        design: ToEverySource(BuildRelayStation)
    },
    storage: {
        premiss: [Level(4)],
        design: BuildStorage()
    },
    heatmapRoad: {
        premiss: [Finished('extension3')],
        design: HeatmapRoadUpdate()
    },
    tower1: {
        premiss: [Finished("storage"), Level(4)],
        design: BuildTower()
    },
    mainLink: {
        premiss: [Finished("storage"), Level(5)],
        design: BuildLink(CloseTo(corps => corps.baseRoom.storage!.pos))
    },
    firstLink: {
        premiss: [Finished("mainLink"), Level(5)],
        design: BuildSourceLink()
    },
    tower2: {
        premiss: [Finished("firstLink"), Level(5)],
        design: BuildTower(FindController)
    },
    heatmapRoadAddition1: {
        premiss: [Finished('extension6')],
        design: HeatmapRoadUpdate("heatmapRoad")
    },
    extractors: {
        premiss: [Level(6)],
        design: AtEveryMineral(Build, STRUCTURE_EXTRACTOR)
    },
    terminal: {
        premiss: [Level(6)],
        design: Build(CloseTo(corps => corps.baseRoom.storage!.pos), STRUCTURE_TERMINAL)
    },
    extractorsRoadCover: {
        premiss: [Finished("extractors")],
        design: AtEveryMineral(Cover, STRUCTURE_ROAD)
    },
}

export function Architect(projects: Projects): Policy {
    return (corps: Corps) => {
        const heathBlueprints = new Set<string>();
        const building: string[] = [];
        _.forIn(corps.memory.blueprints, (blueprint, name) => {
            bindPos(blueprint);
            if (isCompete(blueprint)) {
                heathBlueprints.add(name);
                // TODO: assign not working
                blueprint.completed = true;
            }
            else {
                building.push(name);
                mark(blueprint);
            }
        });
        designAvailableProjects(projects, corps, heathBlueprints);
        printBuilding(building, corps);
    }
}

function printBuilding(building: string[], corps: Corps) {
    if (building.length && Game.time % 5 == 0)
        console.log(`[${corps.name}] building ${building.join(', ')}`);
}

function designAvailableProjects(projects: Dictionary<Project>, corps: Corps, heathBlueprints: Set<string>) {
    _.forIn(projects, (p, name) => {
        if (name in corps.memory.blueprints || !_.every(p.premiss, pr => pr(p, corps, heathBlueprints)))
            return;
        corps.memory.blueprints[name] = p.design(corps);
        return false;
    });
}
