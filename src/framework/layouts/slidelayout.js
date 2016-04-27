'use strict';
var $ = require('../domhelpers.js');
var Kern = require('../../kern/Kern.js');
var layoutManager = require('../layoutmanager.js');
var LayerLayout = require('./layerlayout.js');

var SlideLayout = LayerLayout.extend({
  /**
   * initalize SlideLayout with a layer
   *
   * @param {Type} Name - Description
   * @returns {Type} Description
   */
  constructor: function(layer) {
    LayerLayout.call(this, layer);
    var that = this;
    this._preparedTransitions = {};
    // create a bound version of swipeTransition() that will be stored to the transitions hash
    var swipeTransition = function(type, currentFrameTransformData, targetFrameTransformData) {
      return that.swipeTransition(type, currentFrameTransformData, targetFrameTransformData);
    };

    this.transitions = {
      default: swipeTransition,
      left: swipeTransition,
      right: swipeTransition,
      up: swipeTransition,
      down: swipeTransition
    };
  },
  /**
   * transforms immidiately to the specified frame. hides all other frames
   *
   * @param {FrameView} frame - the frame to activate
   * @param {Object} transfromData - transform data of current frame
   * @param {string} transform - a string representing the scroll transform of the current frame
   * @returns {void}
   */
  showFrame: function(frame, frameTransformData, transform) {
    for (var i = 0; i < this.layer.innerEl.children.length; i++) {
      this.layer.innerEl.children[i].style.display = 'none';
    }
    this._applyTransform(frame, this._currentFrameTransform = this._calcFrameTransform(frameTransformData), transform, {
      display: '',
      opacity: 1,
      visibility: ''
    });
    this._preparedTransitions = {};
  },
  /**
   * transform to a given frame in this layer with given transition
   *
   * @param {FrameView} frame - frame to transition to
   * @param {Object} transition - transition object
   * @param {Object} targetFrameTransformData - the transformData object of the target frame
   * @param {string} targetTransform - transform representing the scrolling after transition
   * @returns {Kern.Promise} a promise fullfilled after the transition finished. Note: if you start another transition before the first one finished, this promise will not be resolved.
   */
  transitionTo: function(frame, transition, targetFrameTransformData, targetTransform) {
    var that = this;
    var currentFrame = that.layer.currentFrame;
    return this.prepareTransition(frame, transition, targetFrameTransformData, targetTransform).then(function(t) {
      var finished = new Kern.Promise();
      console.log('now for real');
      frame.outerEl.addEventListener("transitionend", function f(e) { // FIXME needs webkitTransitionEnd etc
        e.target.removeEventListener(e.type, f); // remove event listener for transitionEnd.
        if (transition.transitionID === that.layer.transitionID) {
          currentFrame.applyStyles({
            transition: '',
            display: 'none'
          });
          frame.applyStyles({
            transition: ''
          });
        }
        // wait until above styles are applied;
        $.postAnimationFrame(function() {
          finished.resolve();
        });
      });
      that._applyTransform(frame, that._currentFrameTransform = that._calcFrameTransform(targetFrameTransformData), targetTransform, {
        transition: transition.duration
      });
      that._applyTransform(currentFrame, t.c1, targetTransform, {
        transition: transition.duration
      });
      that._preparedTransitions = {};
      // wait until post transforms are applied an signal that animation is now running.
      $.postAnimationFrame(function() {
        that.layer.trigger('transitionStarted');
      });
      return finished;
    });
  },
  /**
   * calculate pre and post transforms for current and target frame
   * needed for swipes
   * make sure targetFrame is at pre position
   *
   * @param {ViewFrame} frame - the target frame
   * @param {Object} transition - transition object
   * @param {Object} targetFrameTransformData - the transformData object of the target frame
   * @param {string} targetTransform - transform representing the scrolling after transition
   * @returns {Promise} will fire when pre transform to target frame is applied
   */
  prepareTransition: function(frame, transition, targetFrameTransformData, targetTransform) {
    // create a promise that will wait for the transform being applied
    var finished = new Kern.Promise();
    var prep;
    // check if transition is already prepared
    if ((prep = this._preparedTransitions[frame.data.attributes.id])) {
      if (prep.transform === targetTransform && prep.applied) { // if also the targetTransform is already applied we can just continue
        finished.resolve(prep);
        return finished;
      }
    }
    // call the transition type function to calculate all frame positions/transforms
    prep = this._preparedTransitions[frame.data.attributes.id] = this.transitions[transition.type](transition.type, this.layer.currentFrameTransformData, targetFrameTransformData); // WARNING: this.layer.currentFrameTransformData should still be the old one here. carefull: this.layer.currentFrameTransformData will be set by LayerView before transition ends!
    // apply pre position to target frame
    this._applyTransform(frame, prep.t0, this.layer.currentTransform, {
      transition: '',
      opacity: '1',
      visibility: ''
    });
    prep.transform = targetTransform;
    console.log(prep.t0);
    // wait until new postions are rendered then resolve promise
    $.postAnimationFrame(function() {
      prep.applied = true;
      console.log('resolve');
      finished.resolve(prep);
    });
    return finished;
  },
  /**
   * apply new scrolling transform to layer
   *
   * @param {string} transform - the scrolling transform
   */
  setLayerTransform: function(transform) {
    this._applyTransform(this.layer.currentFrame, this._currentFrameTransform, transform);
  },
  /**
   * apply transform by combining the frames base transform with the added scroll transform
   *
   * @param {FrameView} frame - the frame that should be transformed
   * @param {Object} baseTransform - a plain object containing the styles for the frame transform
   * @param {String} addedTransform - a string to be added to the "transform" style which represents the scroll transform
   * @param {Object} styles - additional styles for example for transition timing.
   * @returns {void}
   */
  _applyTransform: function(frame, frameTransform, addedTransform, styles) {
    frame.applyStyles(styles || {}, {
      transform: addedTransform + " " + frameTransform
    });
  },
  /**
   * calculate the transform for a give frame using its transformData record
   *
   * @param {Object} frameTransformData - the transform data of the frame
   * @returns {string} the calculated transform
   */
  _calcFrameTransform: function(frameTransformData) {
    var x = -frameTransformData.shiftX;
    var y = -frameTransformData.shiftY;
    return "translate3d(" + x + "px," + y + "px,0px) scale(" + frameTransformData.scale + ")";
  },
  /**
   * calculates pre and post positions for simple swipe transitions.
   *
   * @param {string} type - the transition type (e.g. "left")
   * @param {Integer} which - Boolean mask describing which positions need to be calculated
   * @param {Object} ctfd - currentFrameTransformData - transform data of current frame
   * @param {Object} ttfd - targetFrameTransformData - transform data of target frame
   * @returns {Object} the "t" record containing pre and post transforms
   */
  swipeTransition: function(type, ctfd, ttfd) {
    var t = {}; // record taking pre and post positions
    var x, y;
    switch (type) {
      case 'default':
      case 'left':
        // target frame transform time 0
        x = Math.max(this.getStageWidth(), ctfd.width) - ctfd.shiftX + ttfd.shiftX;
        y = -ttfd.shiftY + ctfd.scrollY * ctfd.scale - ttfd.scrollY * ttfd.scale;
        // FIXME: translate and scale may actually be swapped here, not tested yet as shift was always zero so far!!!
        t.t0 = "translate3d(" + x + "px," + y + "px,0px) scale(" + ttfd.scale + ")";
        // current frame transform time 1
        y = -ctfd.shiftY - ctfd.scrollY * ctfd.scale + ttfd.scrollY * ttfd.scale;
        t.c1 = "translate3d(" + (-x) + "px," + y + "px,0px) scale(" + ctfd.scale + ")";
        break;

      case 'right':
        // target frame transform time 0
        x = -Math.max(this.getStageWidth(), ctfd.width) + ctfd.shiftX;
        y = -ttfd.shiftY;
        t.t0 = "translate3d(" + x + "px," + y + "px,0px) scale(" + ttfd.scale + ")";
        // current frame transform time 1
        x = Math.max(this.getStageWidth(), ttfd.width) - ctfd.shiftX;
        y = ctfd.shiftY;
        t.c1 = "translate3d(" + x + "px," + y + "px,0px) scale(" + ctfd.scale + ")";
        break;

      case 'down':
        // target frame transform time 0
        x = -ttfd.shiftX;
        y = -Math.max(this.getStageHeight(), ctfd.height, ttfd.height) + ctfd.shiftY;
        t.t0 = "translate3d(" + x + "px," + y + "px,0px) scale(" + ttfd.scale + ")";
        // current frame transform time 1
        x = ctfd.shiftX;
        y = Math.max(this.getStageHeight(), ctfd.height, ttfd.height) - ctfd.shiftY;
        t.c1 = "translate3d(" + x + "px," + y + "px,0px) scale(" + ctfd.scale + ")";
        break;

      case 'up':
        // target frame transform time 0
        x = -ttfd.shiftX;
        y = Math.max(this.getStageHeight(), ctfd.height, ttfd.height) - ttfd.shiftY;
        t.t0 = "translate3d(" + x + "px," + y + "px,0px) scale(" + ttfd.scale + ")";
        // current frame transform time 1
        x = -ctfd.shiftX;
        y = -Math.max(this.getStageHeight(), ctfd.height, ttfd.height) - ctfd.shiftY;
        t.c1 = "translate3d(" + x + "px," + y + "px,0px) scale(" + ctfd.scale + ")";
        break;
    }

    return t;
  }
});

layoutManager.registerType('slide', SlideLayout);

module.exports = SlideLayout;