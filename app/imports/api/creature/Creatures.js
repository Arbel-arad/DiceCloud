import SimpleSchema from 'simpl-schema';
import deathSaveSchema from "/imports/api/properties/subSchemas/DeathSavesSchema.js"
import ColorSchema from "/imports/api/properties/subSchemas/ColorSchema.js";
import SharingSchema from '/imports/api/sharing/SharingSchema.js';

//set up the collection for creatures
Creatures = new Mongo.Collection("creatures");

let CreatureSettingsSchema = new SimpleSchema({
	//slowed down by carrying too much?
	useVariantEncumbrance: {
		type: Boolean,
		optional: true,
	},
	//hide spellcasting tab
	hideSpellcasting: {
		type: Boolean,
		optional: true,
	},
	// Swap around the modifier and stat
	swapStatAndModifier: {
		type: Boolean,
		optional: true,
	},
});

let CreatureSchema = new SimpleSchema({
	// Strings
	name: {
		type: String,
		defaultValue: "",
		optional: true,
	},
	urlName: {
		type: String,
		optional: true,
		autoValue: function() {
			return getSlug(this.field("name").value, {maintainCase: true}) || "-";
		},
	},
	alignment: {
		type: String,
		optional: true
	},
	gender: 			{
		type: String,
		optional: true
	},
	picture:      {
		type: String,
		optional: true
	},

	// Mechanics
	deathSave: {
		type: deathSaveSchema,
		defaultValue: {},
	},
	xp: {
		type: SimpleSchema.Integer,
		defaultValue: 0,
	},
	weightCarried: {
		type: Number,
		defaultValue: 0,
	},
	level: {
		type: SimpleSchema.Integer,
		defaultValue: 0,
	},
	type: {
		type: String,
		defaultValue: "pc",
		allowedValues: ["pc", "npc", "monster"],
	},
	variables: {
		type: Object,
		blackbox: true,
		defaultValue: {}
	},

	// Settings
	settings: {
		type: CreatureSettingsSchema,
		defaultValue: {},
	},
});

CreatureSchema.extend(ColorSchema);
CreatureSchema.extend(SharingSchema);

Creatures.attachSchema(CreatureSchema);

const insertCreature = new ValidatedMethod({

  name: "Creatures.methods.insertCreature",

  validate: null,

  run() {
    if (!this.userId) {
      throw new Meteor.Error("Creatures.methods.insert.denied",
      "You need to be logged in to insert a creature");
    }

		// Create the creature document
    let charId = Creatures.insert({
			owner: this.userId,
		});
		this.unblock();
		return charId;
  },

});

export default Creatures;
export { CreatureSchema, insertCreature };
