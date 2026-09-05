import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  abilityModifier,
  createCharacter,
  createEmptyParty,
  addCharacter,
  deriveStats,
  maxHitPoints,
  proficiencyBonus,
} from './index';

describe('abilityModifier', () => {
  it('maps classic breakpoints', () => {
    assert.equal(abilityModifier(1), -5);
    assert.equal(abilityModifier(8), -1);
    assert.equal(abilityModifier(9), -1);
    assert.equal(abilityModifier(10), 0);
    assert.equal(abilityModifier(11), 0);
    assert.equal(abilityModifier(12), 1);
    assert.equal(abilityModifier(13), 1);
    assert.equal(abilityModifier(14), 2);
    assert.equal(abilityModifier(15), 2);
    assert.equal(abilityModifier(16), 3);
    assert.equal(abilityModifier(18), 4);
    assert.equal(abilityModifier(20), 5);
  });
});

describe('proficiencyBonus', () => {
  it('follows 2 + floor((L-1)/4) with clamp', () => {
    assert.equal(proficiencyBonus(1), 2);
    assert.equal(proficiencyBonus(4), 2);
    assert.equal(proficiencyBonus(5), 3);
    assert.equal(proficiencyBonus(8), 3);
    assert.equal(proficiencyBonus(9), 4);
    assert.equal(proficiencyBonus(13), 5);
    assert.equal(proficiencyBonus(17), 6);
    assert.equal(proficiencyBonus(20), 6);
    assert.equal(proficiencyBonus(0), 2);
    assert.equal(proficiencyBonus(99), 6);
  });
});

describe('maxHitPoints', () => {
  it('computes level 1 and higher with con mod', () => {
    // hitDie 8, con 14 (+2) => 10 at L1
    assert.equal(maxHitPoints(1, 14, 8), 10);
    // per level max(1, 4+1+2)=7 => L3 = 10 + 14 = 24
    assert.equal(maxHitPoints(3, 14, 8), 24);
    // low con never drops below 1 at L1
    assert.equal(maxHitPoints(1, 1, 4), 1);
  });
});

describe('deriveStats', () => {
  it('derives AC, initiative, passive perception, HP, proficiency', () => {
    const hero = createCharacter({
      id: 'c1',
      name: 'Ash',
      level: 5,
      hitDie: 10,
      abilities: {
        strength: 16,
        dexterity: 14,
        constitution: 15,
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      },
    });
    const d = deriveStats(hero);
    assert.equal(d.modifiers.strength, 3);
    assert.equal(d.modifiers.dexterity, 2);
    assert.equal(d.modifiers.constitution, 2);
    assert.equal(d.modifiers.intelligence, 0);
    assert.equal(d.modifiers.wisdom, 1);
    assert.equal(d.modifiers.charisma, -1);
    assert.equal(d.proficiencyBonus, 3);
    assert.equal(d.armorClass, 12);
    assert.equal(d.initiativeBonus, 2);
    assert.equal(d.passivePerception, 11);
    // L1: 10+2=12; per: max(1,5+1+2)=8; L5 => 12 + 32 = 44
    assert.equal(d.maxHitPoints, 44);
  });
});

describe('party', () => {
  it('starts empty and does not auto-spawn companions', () => {
    const party = createEmptyParty();
    assert.equal(party.length, 0);
    const solo = createCharacter({ id: 'solo', name: 'Wanderer' });
    const withOne = addCharacter(party, solo);
    assert.equal(withOne.length, 1);
    assert.equal(party.length, 0);
  });

  it('preserves identity fields including originMode and sealed seed', () => {
    const c = createCharacter({
      id: 'm1',
      name: 'Mira',
      description: 'scarred cartographer',
      className: 'Scout',
      age: 29,
      originMode: 'memory-loss',
      sealedBackstorySeed: 'seed-alpha',
    });
    assert.equal(c.originMode, 'memory-loss');
    assert.equal(c.sealedBackstorySeed, 'seed-alpha');
    assert.equal(c.description, 'scarred cartographer');
    assert.equal(c.className, 'Scout');
    assert.equal(c.age, 29);
  });
});
