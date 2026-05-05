import { describe, it, expect } from "vitest";
import {
  FIELD_STRATEGIES,
  getFieldStrategy,
} from "../../../src/core/utils/field-strategy-registry";

describe("field-strategy registry", () => {
  it("includes the field-generate strategies that have refine support in v1", () => {
    expect(FIELD_STRATEGIES.attg).toBeDefined();
    expect(FIELD_STRATEGIES.style).toBeDefined();
  });

  it("getFieldStrategy returns the registered factory", () => {
    expect(typeof getFieldStrategy("attg")).toBe("function");
  });

  it("getFieldStrategy throws on unknown id", () => {
    expect(() => getFieldStrategy("nope")).toThrow(/no field strategy/i);
  });
});
