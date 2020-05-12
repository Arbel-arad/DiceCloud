import SimpleSchema from 'simpl-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';

const userSchema = new SimpleSchema({
	username: {
		type: String,
		optional: true,
		max: 30,
		min: 4,
	},
	emails: {
		type: Array,
		optional: true,
	},
	'emails.$': {
		type: Object,
	},
	'emails.$.address': {
		type: String,
		regEx: SimpleSchema.RegEx.Email,
	},
	'emails.$.verified': {
		type: Boolean,
	},
	registered_emails: {
		type: Array,
		optional: true,
	},
	'registered_emails.$': {
		type: Object,
		blackbox: true,
	},
	createdAt: {
		type: Date
	},
	services: {
		type: Object,
		optional: true,
		blackbox: true,
	},
	roles: {
		type: Array,
		optional: true,
	},
	'roles.$': {
		type: String
	},
	// In order to avoid an 'Exception in setInterval callback' from Meteor
	heartbeat: {
		type: Date,
		optional: true,
	},
	apiKey: {
		type: String,
		index: 1,
		optional: true,
	},
	darkMode: {
		type: Boolean,
		optional: true,
	},
	subscribedLibraries: {
		type: Array,
		defaultValue: [],
		max: 100,
	},
	'subscribedLibraries.$': {
		type: String,
    regEx: SimpleSchema.RegEx.Id,
	},
  subscribedCharacters: {
		type: Array,
		defaultValue: [],
		max: 100,
	},
	'subscribedCharacters.$': {
		type: String,
    regEx: SimpleSchema.RegEx.Id,
	},
});

Meteor.users.attachSchema(userSchema);

Meteor.users.generateApiKey = new ValidatedMethod({
  name: 'Users.methods.generateApiKey',
	validate: null,
  run(){
		if(Meteor.isClient) return;
		var user = Meteor.users.findOne(this.userId);
		if (!user) return;
		if (user && user.apiKey) return;
		var apiKey = Random.id(30);
		Meteor.users.update(this.userId, {$set: {apiKey}});
	},
});

Meteor.users.setDarkMode = new ValidatedMethod({
  name: 'Users.methods.setDarkMode',
	validate: new SimpleSchema({
    darkMode: { type: Boolean },
  }).validator(),
  run({darkMode}){
		if (!this.userId) return;
		Meteor.users.update(this.userId, {$set: {darkMode}});
	},
});

Meteor.users.sendVerificationEmail = new ValidatedMethod({
	name: 'Users.methods.sendVerificationEmail',
	validate: new SimpleSchema({
		userId:{
			type: String,
			optional: true,
		},
		address: {
			type: String,
		},
	}).validator(),
	run({userId, address}){
		userId = this.userId || userId;
		let user = Meteor.users.findOne(userId);
		if (!user) {
			throw new Meteor.Error('User not found',
				'Can\'t send a validation email to a user that does not exist');
		}
		if (!_.some(user.emails, email => email.address === address)) {
			throw new Meteor.Error('Email address not found',
				'The specified email address wasn\'t found on this user account');
		}
		Accounts.sendVerificationEmail(userId, address);
	}
});

Meteor.users.isAdmin = function(userId){
	userId = this.userId || userId;
	let user = Meteor.users.findOne(userId);
	return user && user.roles.includes('admin');
}

Meteor.users.canPickUsername = new ValidatedMethod({
	name: 'Users.methods.canPickUsername',
	validate: userSchema.pick('username').validator(),
	run({username}){
		if (Meteor.isClient) return;
		let user = Accounts.findUserByUsername(username);
    // You can pick your own username
    if (user && user._id === this.userId){
      return false;
    }
		return !!user;
	}
});

Meteor.users.setUsername = new ValidatedMethod({
  name: 'Users.methods.setUsername',
	validate: userSchema.pick('username').validator(),
	run({username}){
		if (!this.userId) throw 'Can only set your username if logged in';
    if (Meteor.isClient) return;
    return Accounts.setUsername(this.userId, username)
	}
});

Meteor.users.subscribeToLibrary = new ValidatedMethod({
  name: 'Users.methods.subscribeToLibrary',
	validate: new SimpleSchema({
		libraryId:{
			type: String,
      regEx: SimpleSchema.RegEx.Id,
		},
    subscribe: {
      type: Boolean,
    },
	}).validator(),
	run({libraryId, subscribe}){
		if (!this.userId) throw 'Can only subscribe if logged in';
    if (subscribe){
      return Meteor.users.update(this.userId, {
        $addToSet: {subscribedLibraries: libraryId},
      });
    } else {
      return Meteor.users.update(this.userId, {
        $pullAll: {subscribedLibraries: libraryId},
      });
    }
	}
});

Meteor.users.findUserByUsernameOrEmail = new ValidatedMethod({
	name: 'Users.methods.findUserByUsernameOrEmail',
	validate: new SimpleSchema({
		usernameOrEmail:{
			type: String,
		},
	}).validator(),
	run({usernameOrEmail}){
		if (Meteor.isClient) return;
		let user = Accounts.findUserByUsername(usernameOrEmail) ||
			Accounts.findUserByEmail(usernameOrEmail);
		return user && user._id;
	}
});
