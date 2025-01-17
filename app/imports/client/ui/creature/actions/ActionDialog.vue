<template lang="html">
  <div class="d-flex flex-column">
    <v-toolbar
      class="base-dialog-toolbar"
    >
      <v-btn
        icon
        @click="cancel"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title>
        Action
      </v-toolbar-title>
    </v-toolbar>
    <div class="action-dialog-content">
      <div class="action-dialog-layout d-flex">
        <component
          :is="activeInput"
          v-if="activeInput"
          v-model="userInput"
          class="action-input"
          v-bind="activeInputParams"
          @continue="continueAction"
          @set-input-ready="setInputReady"
        />
        <div
          v-else
          class="action-input"
        />
        <div
          class="log-preview card-raised-background d-flex flex-column align-end justify-end"
          style="flex-basis: 256px;"
        >
          <v-card
            v-if="allLogContent && allLogContent.length"
            class="ma-2 log-entry"
          >
            <v-card-text
              class="pa-2"
            >
              <log-content :model="allLogContent" />
            </v-card-text>
          </v-card>
        </div>
      </div>
    </div>
    <div class="action-dialog-actions pa-2 d-flex justify-end">
      <v-btn
        v-if="actionDone"
        text
        color="accent"
        @click="finishAction"
      >
        Done
      </v-btn>
      <v-btn
        v-else
        text
        color="accent"
        @click="continueAction"
      >
        Next
      </v-btn>
    </div>
  </div>
</template>

<script lang="js">
import applyAction from '/imports/api/engine/action/functions/applyAction';
import getDeterministicDiceRoller from '/imports/api/engine/action/functions/userInput/getDeterministicDiceRoller';

import AdvantageInput from '/imports/client/ui/creature/actions/input/AdvantageInput.vue';
import CheckInput from '/imports/client/ui/creature/actions/input/CheckInput.vue';
import ChoiceInput from '/imports/client/ui/creature/actions/input/ChoiceInput.vue';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import EngineActions from '/imports/api/engine/action/EngineActions';
import LogContent from '/imports/client/ui/log/LogContent.vue';
//import RollInput from '/imports/client/ui/creature/actions/input/RollInput.vue';
import TargetsInput from '/imports/client/ui/creature/actions/input/TargetsInput.vue';
import CastSpellInput from '/imports/client/ui/creature/actions/input/CastSpellInput.vue';

export default {
  components: {
    AdvantageInput,
    CheckInput,
    ChoiceInput,
    DialogBase,
    LogContent,
    //RollInput,
    TargetsInput,
    CastSpellInput,
  },
  props: {
    actionId: {
      type: String,
      default: undefined,
    },
    task: {
      type: Object,
      default: undefined,
    },
  },
  data() {
    return {
      loading: false,
      actionBusy: false,
      actionDone: false,
      actionResult: undefined,
      resumeActionFn: undefined,
      activeInput: undefined,
      activeInputParams: {},
      userInput: undefined,
      userInputReady: true,
    };
  },
  computed: {
    actionJson() {
      return JSON.stringify(this.action, null, 2);
    },
    resultJson() {
      return JSON.stringify(this.actionResult, null, 2);
    },
    allLogContent() {
      const action = this.actionResult;
      const contents = [];
      action?.results?.forEach(result => {
        result.mutations?.forEach(mutation => {
          mutation.contents?.forEach(logContent => {
            contents.push(logContent);
          });
        });
      });
      return contents;
    },
  },
  meteor: {
    action() {
      return EngineActions.findOne(this.actionId);
    },
  },
  mounted() {
    this.deterministicDiceRoller = getDeterministicDiceRoller(this.actionId);
    this.startAction({ stepThrough: false });
  },
  methods: {
    startAction({ stepThrough }) {
      this.actionBusy = true;
      this.actionResult = {
        ...this.action,
        _stepThrough: undefined,
        _isSimulation: undefined, 
        taskCount: undefined,
      };
      applyAction(
        this.actionResult, this, { simulate: true, stepThrough}
      ).then(() => {
        this.actionDone = true;
        this.actionBusy = false;
        this.activeInput = undefined;
      });
    },
    stepAction() {
      if (this.actionResult) {
        this.actionResult._stepThrough = true;
      }
      this.resumeActionFn?.();
    },
    continueAction() {
      if (this.actionResult) {
        this.actionResult._stepThrough = false;
      }
      this.resumeActionFn?.();
    },
    finishAction() {
      this.$store.dispatch('popDialogStack', this.actionResult);
    },
    promiseInput() {
      return new Promise(resolve => {
        this.resumeActionFn = () => {
          this.resumeActionFn = undefined;
          const savedInput = this.userInput;
          this.userInput = undefined;
          this.activeInput = undefined;
          this.activeInputParams = {};
          this.userInputReady = false;
          resolve(savedInput);
        }
      });
    },
    setInputReady(val) {
      this.userInputReady = val;
    },
    cancel() {
      this.$store.dispatch('popDialogStack');
    },
    // inputProvider methods
    async targetIds(target) {
      this.userInput = [];
      this.activeInputParams = {
        target,
        tabletopId: this.action.tabletopId,
      };
      this.activeInput = 'targets-input'
      return this.promiseInput();
    },
    async rollDice(dice) {
      return Promise.resolve(this.deterministicDiceRoller(dice));
      /* Dice Animation and user control goes here:
      this.activeInputParams = {
        deterministicDiceRoller: this.deterministicDiceRoller,
        dice
      };
      this.activeInput = 'roll-input';
      return this.promiseInput();
      */
    },
    async nextStep(task) {
      return this.promiseInput();
    },
    async choose(choices, quantity) {
      this.userInput = [];
      this.activeInputParams = {
        choices,
        quantity
      };
      this.activeInput = 'choice-input'
      return this.promiseInput();
    },
    async advantage(suggestedAdvantage) {
      this.userInput = suggestedAdvantage;
      this.activeInput = 'advantage-input';
      this.userInputReady = true;
      return this.promiseInput();
    },
    async check(suggestedParams) {
      this.userInput = suggestedParams;
      this.activeInput = 'check-input';
      return this.promiseInput();
    },
    async castSpell(suggestedParams) {
      this.userInput = suggestedParams;
      console.log(this.action);
      console.log(this.action.root);
      this.activeInputParams = {
        creatureId: this.action.creatureId,
      };
      this.activeInput = 'cast-spell-input';
      return this.promiseInput();
    },
  }
};
</script>

<style lang="css" scoped>
.base-dialog-toolbar {
  z-index: 2;
  border-radius: 2px 2px 0 0;
}

.action-dialog-content {
  container-type: size;
  flex-grow: 1;
  overflow: auto;
}

.action-dialog-content, .action-dialog-layout {
  height: 100%;
}

.action-input {
  flex-grow: 1;
  height: 100%;
  overflow-y: auto;
}

.log-preview {
  flex-basis: 256px;
  height: 100%;
  overflow-y: auto;
}

@container (max-width: 600px) {
  .action-dialog-layout {
    flex-direction: column;
  }
  .action-input {
    height: unset;
  }
  .log-preview {
    flex-basis: 300px;
  }
}

</style>
