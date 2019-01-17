type TaskMemory = MoveTaskMemory | HarvestTaskMemory | TransferTaskMemory | UpgradeControllerTaskMemory;

declare const enum TaskType {
  Idle = "i",
  Move = "m",
  Harvest = "h",
  Transfer = "t",
  UpgradeController = "u",
  Build = "b",
  Repair = "r",
}
interface TaskMemoryBase {
  excutorId?: string;
  targetId?: string;
  type: string;
  priority: number;
  child?: TaskMemory[];
}

interface MoveTaskMemory extends TaskMemoryBase {
  type: TaskType.Move;
  pos: RoomPosition;
  range: number;
}
interface HarvestTaskMemory extends TaskMemoryBase {
  type: TaskType.Harvest;
}
interface TransferTaskMemory extends TaskMemoryBase {
  type: TaskType.Transfer;
  resource: ResourceConstant;
}
interface UpgradeControllerTaskMemory extends TaskMemoryBase {
  type: TaskType.UpgradeController;
}

interface Role {
  run(creep: Creep): void;
}

interface ObjectMemory {
  [key: string]: number;
}

interface CreepMemory {
  role: string;
  working: boolean;
}

interface SpawnMemory {

}

interface RoomMemory {
  expectedLevel: number;
  expectedWOrkers: number;
  assignedTasks: TaskMemory[];
  taskQueue: TaskMemory[];
  objects: { [key: string]: ObjectMemory };
}

interface Memory {
  uuid: number;
  log: any;
}

// `global` extension samples
declare namespace NodeJS {
  interface Global {
    log: any;
  }
}
