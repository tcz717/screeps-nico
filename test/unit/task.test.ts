import { assert } from "chai";
import { Game, Memory } from "./mock"
import { isStorable } from "task";

describe("isStorable", () => {
  it("should not be true for undefined", () => {
    assert.isFalse(isStorable(undefined));
  });
});
