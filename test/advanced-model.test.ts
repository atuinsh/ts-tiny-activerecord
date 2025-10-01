import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Model, Persistence, ValueEncoder } from "../src";
import { createSqliteAdapter } from "./sqlite-adapter";
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

type ComplexAttrs = {
  id?: string;
  name: string;
  metadata: Record<string, any>;
  secretKey: string;
  count: number;
  lastUpdated: Date;
}

// JSON encoder for metadata field
const jsonEncoder: ValueEncoder<Record<string, any>, string> = {
  encode: (value) => JSON.stringify(value),
  decode: (value) => JSON.parse(value)
};

// Date encoder for lastUpdated field
const dateEncoder: ValueEncoder<Date, string> = {
  encode: (value) => value.toISOString(),
  decode: (value) => new Date(value)
};

let preSaveCalled: any = false;
let postSaveCalled: any = false;
let postLoadCalled: any = false;
let postDeleteCalled: any = false;

@Persistence<ComplexAttrs>(
  createSqliteAdapter({
    dbName: "test_db2",
    tableName: "complex_models",
    primaryKeyField: "id",
  }),
  {
    secretKey: { persist: false },
    metadata: { encoder: jsonEncoder },
    lastUpdated: { encoder: dateEncoder },
  },
  {
    preSave: async (_context, model, type) => {
      preSaveCalled = type;
      const count = model.get("count");
      model.set("count", count + 1);
    },
    postSave: async (_context, _model, type) => {
      postSaveCalled = type;
    },
    postLoad: async (_context, _model) => {
      postLoadCalled = true;
    },
    postDelete: async (_context, _model) => {
      postDeleteCalled = true;
    },
  }
)
class ComplexModel extends Model<ComplexAttrs> {}

describe("Advanced Model Features", () => {
  const dbPath = "/tmp/test_db2.db";

  before(async () => {
    const adapter = createSqliteAdapter({
      dbName: "test_db2",
      tableName: "complex_models",
      primaryKeyField: "id",
    });
    const ctx = await adapter.getContext();
    await ctx.db.run(
      "CREATE TABLE IF NOT EXISTS complex_models (id TEXT PRIMARY KEY, name TEXT, metadata TEXT, count INTEGER, last_updated TEXT)"
    );
  });

  after(async () => {
    if (existsSync(dbPath)) {
      await unlink(dbPath);
    }
  });

  beforeEach(() => {
    preSaveCalled = false;
    postSaveCalled = false;
    postLoadCalled = false;
    postDeleteCalled = false;
  });

  it("should handle non-persisted fields", async () => {
    const model = new ComplexModel({
      name: "Test Model",
      metadata: { foo: "bar" },
      secretKey: "secret123",
      count: 1,
      lastUpdated: new Date(),
    });

    await model.save();
    const loaded = await ComplexModel.get(model.get("id"));

    assert.equal(loaded?.get("secretKey"), undefined);
    assert.equal(loaded?.get("name"), "Test Model");
  });

  it("should encode and decode JSON fields", async () => {
    const metadata = { foo: "bar", num: 123, nested: { test: true } };
    const model = new ComplexModel({
      name: "JSON Test",
      metadata,
      secretKey: "secret123",
      count: 1,
      lastUpdated: new Date(),
    });

    await model.save();
    const loaded = await ComplexModel.get(model.get("id"));

    assert.deepEqual(loaded?.get("metadata"), metadata);
  });

  it("should encode and decode Date fields", async () => {
    const date = new Date();
    const model = new ComplexModel({
      name: "Date Test",
      metadata: {},
      secretKey: "secret123",
      count: 1,
      lastUpdated: date,
    });

    await model.save();
    const loaded = await ComplexModel.get(model.get("id"));

    assert.ok(loaded?.get("lastUpdated") instanceof Date);
    assert.equal(loaded?.get("lastUpdated").getTime(), date.getTime());
  });

  it("should call lifecycle hooks", async () => {
    const model = new ComplexModel({
      name: "Hooks Test",
      metadata: {},
      secretKey: "secret123",
      count: 1,
      lastUpdated: new Date(),
    });

    await model.save();
    assert.equal(preSaveCalled, "insert");
    assert.equal(postSaveCalled, "insert");
    assert.equal(model.get("count"), 2);
    preSaveCalled = false;
    postSaveCalled = false;

    await model.save();
    assert.equal(preSaveCalled, false);
    assert.equal(postSaveCalled, false);
    assert.equal(model.get("count"), 2);

    await ComplexModel.get(model.get("id"));
    assert.equal(postLoadCalled, true);
  });

  it("should only encode changed fields on update", async () => {
    const model = new ComplexModel({
      name: "Update Test",
      metadata: { initial: true },
      count: 1,
      secretKey: "secret123",
      lastUpdated: new Date(),
    });

    await model.save();

    // Reset the hook flags
    preSaveCalled = false;
    postSaveCalled = false;

    // Update only the name
    model.set("name", "Updated Name");
    await model.save();

    const loaded = await ComplexModel.get(model.get("id"));
    assert.equal(loaded?.get("name"), "Updated Name");
    assert.deepEqual(loaded?.get("metadata"), { initial: true });
    assert.equal(preSaveCalled, "update");
    assert.equal(postSaveCalled, "update");
  });

  it("should retrieve all models and handle encoders", async () => {
    const date1 = new Date();
    const date2 = new Date();

    await new ComplexModel({
      name: "Model 1",
      metadata: { type: "test1" },
      secretKey: "secret1",
      count: 1,
      lastUpdated: date1,
    }).save();

    await new ComplexModel({
      name: "Model 2",
      metadata: { type: "test2" },
      secretKey: "secret2",
      count: 1,
      lastUpdated: date2,
    }).save();

    const allModels = await ComplexModel.all();
    assert.ok(allModels.length >= 2);
    assert.ok(allModels[0]?.get("metadata") instanceof Object);
    assert.ok(allModels[0]?.get("lastUpdated") instanceof Date);
    assert.equal(postLoadCalled, true);
  });

  it("should retrieve models by criteria with encoded fields", async () => {
    const date = new Date();
    await new ComplexModel({
      name: "Search Test",
      metadata: { searchKey: "findMe" },
      secretKey: "secret",
      count: 1,
      lastUpdated: date,
    }).save();

    const foundModel = await ComplexModel.getBy({ name: "Search Test" });
    assert.notEqual(foundModel, null);
    assert.equal(foundModel?.get("metadata")?.searchKey, "findMe");
    assert.equal(foundModel?.get("lastUpdated").getTime(), date.getTime());
    assert.equal(postLoadCalled, true);
  });

  it("should delete a model and handle lifecycle hooks", async () => {
    const model = new ComplexModel({
      name: "Delete Test",
      metadata: { toDelete: true },
      secretKey: "secret123",
      count: 1,
      lastUpdated: new Date(),
    });
    await model.save();
    const id = model.get("id");

    // Verify model exists
    let loadedModel = await ComplexModel.get(id);
    assert.notEqual(loadedModel, null);

    // Delete the model
    const success = await model.del();
    assert.equal(success, true);

    // Verify model no longer exists
    loadedModel = await ComplexModel.get(id);
    assert.equal(loadedModel, null);
    assert.equal(postDeleteCalled, true);
  });
});