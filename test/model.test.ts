import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Model, Persistence } from "../src";
import { createSqliteAdapter } from "./sqlite-adapter";
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

type PersonAttrs = {
  id?: string;
  firstName: string;
  lastName: string;
  age: number;
}

@Persistence(createSqliteAdapter({ dbName: "test_db", tableName: "people", primaryKeyField: "id" }))
class Person extends Model<PersonAttrs> {
  public fullName() {
    return `${this.get("firstName")} ${this.get("lastName")}`;
  }

  public birthYear() {
    return new Date().getFullYear() - this.get("age");
  }
}

describe('Model', () => {
  const dbPath = '/tmp/test_db.db';

  before(async () => {
    const adapter = createSqliteAdapter({
      dbName: "test_db",
      tableName: "people",
      primaryKeyField: "id"
    });
    const ctx = await adapter.getContext();
    await ctx.db.run(
      "CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, age INTEGER)"
    );
  });

  after(async () => {
    if (existsSync(dbPath)) {
      await unlink(dbPath);
    }
  });

  it('should create and save a new person', async () => {
    const person = new Person({
      firstName: "John",
      lastName: "Doe",
      age: 30
    });

    assert.equal(person.persisted, false);
    assert.equal(person.get("id"), undefined);

    await person.save();

    assert.equal(person.persisted, true);
    assert.notEqual(person.get("id"), undefined);
  });

  it('should load a saved person', async () => {
    const person = new Person({
      firstName: "Jane",
      lastName: "Smith",
      age: 25
    });
    await person.save();

    const loadedPerson = await Person.get(person.get("id"));
    assert.notEqual(loadedPerson, null);
    assert.equal(loadedPerson?.get("firstName"), "Jane");
    assert.equal(loadedPerson?.get("lastName"), "Smith");
    assert.equal(loadedPerson?.get("age"), 25);
    assert.equal(loadedPerson?.fullName(), "Jane Smith");
  });

  it('should track changed fields', async () => {
    const person = new Person({
      firstName: "Bob",
      lastName: "Wilson",
      age: 40
    });

    assert.deepEqual(person.getChangedFields(), ["firstName", "lastName", "age"]);
    await person.save();
    assert.deepEqual(person.getChangedFields(), []);

    person.set("firstName", "Robert");
    assert.deepEqual(person.getChangedFields(), ["firstName"]);
    await person.save();
    assert.deepEqual(person.getChangedFields(), []);

    const loadedPerson = await Person.get(person.get("id"));
    assert.equal(loadedPerson?.get("firstName"), "Robert");
    assert.equal(loadedPerson?.get("lastName"), "Wilson");
    assert.equal(loadedPerson?.get("age"), 40);
  });

  it('should retrieve all people', async () => {
    // Create multiple people
    await new Person({
      firstName: "Alice",
      lastName: "Johnson",
      age: 28
    }).save();

    await new Person({
      firstName: "Charlie",
      lastName: "Brown",
      age: 35
    }).save();

    const allPeople = await Person.all();
    assert.ok(allPeople.length >= 2);
    assert.ok(allPeople[0] instanceof Person);
  });

  it('should retrieve people by criteria', async () => {
    // Create a person with specific age
    await new Person({
      firstName: "David",
      lastName: "Miller",
      age: 45
    }).save();

    const peopleAge45 = await Person.all({ age: 45 });
    assert.ok(peopleAge45.length > 0);
    assert.equal(peopleAge45[0]?.get("age"), 45);

    const personByName = await Person.getBy({ firstName: "David" });
    assert.notEqual(personByName, null);
    assert.equal(personByName?.get("lastName"), "Miller");
  });

  it('should delete a person', async () => {
    const person = new Person({
      firstName: "ToDelete",
      lastName: "User",
      age: 50
    });
    await person.save();
    const id = person.get("id");

    // Verify person exists
    let loadedPerson = await Person.get(id);
    assert.notEqual(loadedPerson, null);

    // Delete the person
    const success = await person.del();
    assert.equal(success, true);

    // Verify person no longer exists
    loadedPerson = await Person.get(id);
    assert.equal(loadedPerson, null);
  });
});