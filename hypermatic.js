/**
 * Copyright 2015 Kevin Doughty. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *		 http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
 
 // This is a derivative work of:
 // https://github.com/web-animations/web-animations-js-legacy
 // Code has been heavily modified.

 /**
 * Copyright 2012 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *		 http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var Hypermatic = (function() {
'use strict';

var verbose = false;
var ASSERT_ENABLED = false;
var SVG_NS = 'http://www.w3.org/2000/svg';

function assert(check, message) {
	console.assert(ASSERT_ENABLED, 'assert should not be called when ASSERT_ENABLED is false');
	console.assert(check, message);
	// Some implementations of console.assert don't actually throw
	if (!check) { throw message; }
}

function detectFeatures() {
	var el = createDummyElement();
	el.style.cssText = 'width: calc(0px);' + 'width: -webkit-calc(0px);';
	var calcFunction = el.style.width.split('(')[0];
	var transformCandidates = [
		'transform',
		'webkitTransform',
		'msTransform'
	];
	var transformProperty = transformCandidates.filter(function(property) {
		return property in el.style;
	})[0];
	return {
		calcFunction: calcFunction,
		transformProperty: transformProperty
	};
}

function createDummyElement() {
	return document.documentElement.namespaceURI == SVG_NS ? document.createElementNS(SVG_NS, 'g') : document.createElement('div');
}

var features = detectFeatures();
var PRIVATE = {};

var createObject = function(proto, obj) {
	var newObject = Object.create(proto);
	Object.getOwnPropertyNames(obj).forEach(function(name) {
		Object.defineProperty( newObject, name, Object.getOwnPropertyDescriptor(obj, name));
	});
	return newObject;
};

var abstractMethod = function() {
	throw 'Abstract method not implemented.';
};

var IndexSizeError = function(message) {
	Error.call(this);
	this.name = 'IndexSizeError';
	this.message = message;
};

IndexSizeError.prototype = Object.create(Error.prototype);

function TIMING_DICT() {}

/** @constructor */
var TimingDict = function(timingInput) {
	if (typeof timingInput === 'object') {
		for (var k in timingInput) {
			if (k in TimingDict.prototype) {
				this[k] = timingInput[k];
			}
		}
	} else if (isDefinedAndNotNull(timingInput)) {
		this.duration = Number(timingInput);
	}
};

TimingDict.prototype = {
	delay: 0,
	endDelay: 0,
	//fill: 'forwards', // original
	fill : 'none',
	iterationStart: 0,
	iterations: 1,
	duration: 'auto', // original. Auto needed for groups. I would prefer 0
	//duration: 0,
	playbackRate: 1,
	direction: 'normal',
	easing: 'linear'
};

function TIMING() {}

/** @constructor */
var Timing = function(token, timingInput, changeHandler) {
	if (token !== PRIVATE) throw new TypeError('Illegal constructor');
	this._dict = new TimingDict(timingInput);
	this._changeHandler = changeHandler;
};

Timing.prototype = {
	_timingFunction: function(timedItem) {
		var timingFunction = TimingFunction.createFromString(this.easing, timedItem);
		this._timingFunction = function() {
			return timingFunction;
		};
		return timingFunction;
	},
	_invalidateTimingFunction: function() { // deprecated
		delete this._timingFunction;
	},
	_iterations: function() {
		var value = this._dict.iterations;
		return value < 0 ? 1 : value;
	},
	_duration: function() {
		var value = this._dict.duration;
		return typeof value === 'number' ? value : 'auto';
	},
	_clone: function() {
		return new Timing( PRIVATE, this._dict, this._updateInternalState.bind(this));
	}
};

// Configures an accessor descriptor for use with Object.defineProperty() to
// allow the property to be changed and enumerated, to match __defineGetter__()
// and __defineSetter__().
var configureDescriptor = function(descriptor) {
	descriptor.configurable = true;
	descriptor.enumerable = true;
	return descriptor;
};

Timing._defineProperty = function(prop) {
	Object.defineProperty(Timing.prototype, prop, configureDescriptor({
		get: function() {
			return this._dict[prop];
		},
		set: function(value) { // mutate ! // deprecated
			if (isDefinedAndNotNull(value)) {
				if (prop == 'duration' && value == 'auto') {
					// duration is not always a number
				} else if (['delay', 'endDelay', 'iterationStart', 'iterations', 'duration', 'playbackRate'].indexOf(prop) >= 0) {
					value = Number(value);
				}
				this._dict[prop] = value;
			} else {
				delete this._dict[prop];
			}
			// FIXME: probably need to implement specialized handling parsing
			// for each property
			if (prop === 'easing') {
				// Cached timing function may be invalid now.
				this._invalidateTimingFunction();
			}
			this._changeHandler();
		}
	}));
};

for (var prop in TimingDict.prototype) {
	Timing._defineProperty(prop);
}

var isDefined = function(val) {
	return typeof val !== 'undefined';
};

var isDefinedAndNotNull = function(val) {
	return isDefined(val) && (val !== null);
};

var isCustomObject = function(target) {
	return (!(target instanceof Element));
}

function TIMELINE() {

}
/** @constructor */
var Timeline = function(token) {
	if (token !== PRIVATE) throw new TypeError('Illegal constructor');
	// TODO: This will probably need to change.
	this._startTime = documentTimeZeroAsClockTime;
	if (this._startTime !== undefined) this._startTime /= 1000;
	this._statePlayers = [];
	this._stylePlayers = [];
};

Timeline.prototype = {
	get currentTime() {
		if (this._startTime === undefined) {
			this._startTime = documentTimeZeroAsClockTime;
			if (this._startTime === undefined) {
				return null;
			} else {
				this._startTime /= 1000;
			}
		}
		return relativeTime(cachedClockTime(), this._startTime);
	},
	play: function(target) {
		console.log("document.timeline syntax deprecated for now, but may be un-deprecated in the future");
		//return new Player(PRIVATE, this, target);
		return null;
	},
	getCurrentPlayers: function() {
		var state = statePlayers.filter(function(player) {
			return !player._isPastEndOfActiveInterval();
		});
		var style = stylePlayers.filter(function(player) {
			return !player._isPastEndOfActiveInterval();
		});
		return state.concat(style);
	},
	toTimelineTime: function(otherTime, other) {
		if (this.currentTime === null || other.currentTime === null) return null;
		else return otherTime + other._startTime - this._startTime;
	},
	_pauseAnimationsForTesting: function(pauseAt) {
		this._statePlayers.forEach(function(player) {
			player.paused = true;
			player.currentTime = pauseAt;
		});
		this._stylePlayers.forEach(function(player) {
			player.paused = true;
			player.currentTime = pauseAt;
		});
	},
};

function PLAYER() {}
// TODO: Remove dead Players from here?

var playersAreSorted = false;
var playerSequenceNumber = 0;

/** @constructor */
var Player = function(token, timeline, target) {
	if (token !== PRIVATE) throw new TypeError('Illegal constructor');
	
	this._target = target;
	this._registeredOnTimeline = false;
	this._sequenceNumber = playerSequenceNumber++;
	this._timeline = timeline;

	//this._startTime = this.timeline.currentTime === null ? 0 : this.timeline.currentTime;
	this._startTime = 0.0;
	this._timeDrift = 0.0;
	this._pauseTime = undefined;
	this._playbackRate = 1.0;
	this._hasTicked = false;

	this._animations = [];
	this._lastCurrentTime = undefined;

	this._namedAnimations = {};
	this._animationsAreSorted = false;
	this._namedAnimationCounter = {};

	playersAreSorted = false;
	maybeRestartAnimation();
};



Player.prototype = {
	_addAnimation : function(animation,key) {
		if (animation && animation instanceof TimedItem) {
			// TODO: be sure setting start time does not affect groups or child animations adversely.
			if (animation._startTime === null || animation._startTime == undefined) animation._startTime = this.timeline.currentTime === null ? 0 : this.timeline.currentTime; // added as fix for player refactoring, previously animation startTime was always zero
			
			if (!isDefinedAndNotNull(key) && isDefinedAndNotNull(animation._hyperKey)) {
				key = animation._hyperKey;
			}
			
			if (isDefinedAndNotNull(key)) {
				if (animation._hyperIncrementName) { // this is not good, the way I set _hyperKey and _hyperIncrementName
					var increment = this._namedAnimationCounter[key];
					if (!increment) increment = 0;
					this._namedAnimationCounter[key] = increment + 1;
					if (!isDefinedAndNotNull(key)) key = "" + increment;
					else key = key + increment;
					
				}
				animation._hyperKey = key;
				if (this._namedAnimations[key]) {
					this._removeAnimationNamed(key); // remove existing animation with same key
				}
				this._namedAnimations[key] = animation;
			}
			
			this._animations.push(animation);
			this._animationsAreSorted = false;
			this._registerOnTimeline();
			//this._update(); // original // Do not update all animations, might invalidate some before ticker has a chance to remove them.
			animation._updateInheritedTime(this._currentTime); // Do not update all animations, might invalidate some before ticker has a chance to remove them.
			maybeRestartAnimation();
		}
	},
	_removeAnimation: function(animation) {
		var index = this._animations.indexOf(animation);
		if (index > -1) this._removeAnimationAtIndex(index);
		else console.log("groups probably need to be scanned to remove animation");
	},
	_removeAnimationNamed : function(key) {
		var animation = this._namedAnimations[key];
		if (animation) {
			var index = this._animations.indexOf(animation);
			this._animations.splice(index,1);
			delete this._namedAnimations[key];
		}
	},
	_removeAnimationAtIndex: function(index) {
		var animation = this._animations[index];
		var key = animation._hyperKey;
		if (isDefinedAndNotNull(key)) {
			delete this._namedAnimations[key];
		}
		this._animations.splice(index,1); // cannot deregister from timeline here because ticker uses this during players forEach loop
	},
	_animationNamed: function(key) {
		return this._namedAnimations[key];
	},
	get animations() {
		var animations = this._animations;
		
		if (!this._animationsAreSorted) {
			animations.sort(animationSortFunction);
			this._animationsAreSorted = true;
		}
		
		return animations;
	},
	namedAnimations: function() {
		var unnamed = []
		var named = this._namedAnimations;
		for (var key in named) {
			unnamed.push(named[key]);
		}
		return unnamed;
	},
	get target() {
		return this._target;
	},
 	// This is the effective current time.
	set currentTime(currentTime) { // mutate !
		enterModifyCurrentAnimationState();
		try {
			this._currentTime = currentTime;
		} finally {
			exitModifyCurrentAnimationState( this._hasTicked || this.startTime + this._timeDrift <= lastTickTime);
		}
	},
	get currentTime() {
		return this._currentTime === null ? 0 : this._currentTime;
	},
	// This is the current time.
	set _currentTime(currentTime) { // mutate !
		console.log("set _currentTime:%s; NOT USED",currentTime);
		// This seeks by updating _drift. It does not affect the startTime.
		if (isDefined(this._pauseTime)) {
			this._pauseTime = currentTime;
		} else {
			this._timeDrift = (this.timeline.currentTime - this.startTime) *
			this.playbackRate - currentTime;
		}
		this._update(); // I don't want this to be called twice, once here, once in ticker. It doesn't seem like set _currentTime gets called ever
		maybeRestartAnimation();
	},
	get _currentTime() {
		if (this.timeline.currentTime === null) {
			//console.log("timeline.currentTime is null !!!");
			return null;
		}
		return isDefined(this._pauseTime) ? this._pauseTime : (this.timeline.currentTime - this.startTime) * this.playbackRate - this._timeDrift;
	},
	set startTime(startTime) {
		enterModifyCurrentAnimationState();
		try {
			// This seeks by updating _startTime and hence the currentTime. It does not affect _drift.
			this._startTime = startTime;
			playersAreSorted = false;
			this._update();
			maybeRestartAnimation();
		} finally {
			exitModifyCurrentAnimationState( this._hasTicked || this.startTime + this._timeDrift <= lastTickTime);
		}
	},
	get startTime() {
		return this._startTime;
	},
	set paused(isPaused) {
		if (isPaused) {
			this._pauseTime = this.currentTime;
		} else if (isDefined(this._pauseTime)) {
			this._timeDrift = (this.timeline.currentTime - this.startTime) * this.playbackRate - this._pauseTime;
			this._pauseTime = undefined;
			maybeRestartAnimation();
		}
	},
	get paused() {
		return isDefined(this._pauseTime);
	},
	get timeline() {
		return this._timeline;
	},
	set playbackRate(playbackRate) {
		enterModifyCurrentAnimationState();
		try {
			var cachedCurrentTime = this.currentTime;
			// This will impact currentTime, so perform a compensatory seek.
			this._playbackRate = playbackRate;
			this.currentTime = cachedCurrentTime;
		} finally {
			exitModifyCurrentAnimationState(this._hasTicked);
		}
	},
	get playbackRate() {
		return this._playbackRate;
	},
	toJSON : function() {
		return "Player!";
	},
	_update: function() {
		var animations = this._animations;
		var i = animations.length;
		while (i--) {
			animations[i]._updateInheritedTime(this._currentTime);
		}
		this._registerOnTimeline();
	},
	/*
	_getAnimationsTargetingElement: function(element, animations) {
		return this._animations.slice(0);
	},
	*/
	_getLeafItemsInEffect: function(items) {
		var animations = this._animations;
		var i = animations.length;
		while (i--) {
			animations[i]._getLeafItemsInEffect(items);
		}
	},
	/*
	_isTargetingElement: function(element) { // Useless if groups only have one target
		return element === this._target;
	},
	*/
	_generateEvents: function() {
		if (!isDefinedAndNotNull(this._lastCurrentTime)) {
			this._lastCurrentTime = 0;
		}
		var animations = this._animations;
		var i = animations.length;
		while (i--) {
			var animation = animations[i];
			if (animation._needsHandlerPass) {
				var timeDelta = this._currentTime - this._lastCurrentTime;
				if (timeDelta > 0) {
					animation._generateEvents(this._lastCurrentTime, this._currentTime, this.timeline.currentTime, 1);
				}
			}
		}
		this._lastCurrentTime = this._currentTime;
	},
	
	_registerOnTimeline: function() {
		if (!this._registeredOnTimeline) {
			if (!isCustomObject(this._target)) this._timeline._stylePlayers.push(this);
			else this._timeline._statePlayers.push(this);
			this._registeredOnTimeline = true;
		}
	},
	_deregisterFromTimeline: function() {
		if (!isCustomObject(this._target)) {
			var index = this._timeline._stylePlayers.indexOf(this);
			this._timeline._stylePlayers.splice(index,1);
		} else {
			var index = this._timeline._statePlayers.indexOf(this);
			this._timeline._statePlayers.splice(index,1);
		}
		this._registeredOnTimeline = false;
	}
};


function TIMED_ITEM() {}

/** @constructor */
var TimedItem = function(token, timingInput) {
	if (token !== PRIVATE) throw new TypeError('Illegal constructor');
	this.timing = new Timing( PRIVATE, timingInput);//, this._specifiedTimingModified.bind(this));
	this._inheritedTime = null;
	this.currentIteration = null;
	this._iterationTime = null;
	this._animationTime = null;
	//this._startTime = 0.0; // original
	this._startTime = null;
	//this._player = null; // TODO: Remove this reference? used in _updateInternalState to registerOnTimeline, which is probably handled elsewhere, also player._handlerAdded(). Only real use is playback rate, which should not be mutated at the animation level, but ok for Element.player
	this._parent = null;
	this._updateInternalState();
	this._handlers = {};
	this._onHandlers = {};
	this._sequenceNumber = TimedItem.count++;

	this._hyperIndex = 0;
	this._hyperKey = null;
	this._hyperIncrementName = false;
	this._hyperDict = shallowObjectCopy(timingInput);
	
	if (isDefinedAndNotNull(timingInput.startTime)) this._startTime = timingInput.startTime;
	if (isDefinedAndNotNull(timingInput.index)) this._hyperIndex = timingInput.index;
	
	if (isFunction(timingInput.onstart)) this._setOnHandler('start', timingInput.onstart);
	if (isFunction(timingInput.oniteration)) this._setOnHandler('iteration', timingInput.oniteration);
	if (isFunction(timingInput.onend)) this._setOnHandler('end', timingInput.onend);
	if (isFunction(timingInput.oncancel)) this._setOnHandler('cancel', timingInput.oncancel);
};
TimedItem.count = 0;

TimedItem.prototype = {
	/*
	valueForKey: function(key) { 
		return this._hyperDict[key];
	},
	setValueForKey: function(value,key) {
		this._hyperDict[key] = value;
	},
	*/
	get settings() {
		var dict = shallowObjectCopy(this._hyperDict);
		if (!isDefinedAndNotNull(dict.startTime) && isDefinedAndNotNull(this._startTime)) dict.startTime = this._startTime;
		return dict;
	},
	// TODO: It would be good to avoid the need for this. We would need to modify
	// call sites to instead rely on a call from the parent.
	get _effectiveParentTime() {
		return this.parent !== null && this.parent._iterationTime !== null ? this.parent._iterationTime : 0;
	},
	get localTime() {
		return this._inheritedTime === null ? null : this._inheritedTime - this._startTime;
	},
	get startTime() {
		return this._startTime;
	},
	get duration() {
		var result = this.timing._duration();
		if (result === 'auto') result = this._intrinsicDuration();
		return result;
	},
	get activeDuration() {
		var repeatedDuration = this.duration * this.timing._iterations();
		return repeatedDuration / Math.abs(this.timing.playbackRate);
	},
	get endTime() {
		return this._startTime + this.activeDuration + this.timing.delay + this.timing.endDelay;
	},
	get parent() {
		return this._parent;
	},
	get previousSibling() {
		if (!this.parent) return null;
		var siblingIndex = this.parent.indexOf(this) - 1;
		if (siblingIndex < 0) return null;
		return this.parent.children[siblingIndex];
	},
	get nextSibling() {
		if (!this.parent) return null;
		var siblingIndex = this.parent.indexOf(this) + 1;
		if (siblingIndex >= this.parent.children.length) return null;
		return this.parent.children[siblingIndex];
	},
	_setParent: function(parent) {
		if (parent === this) throw new Error('parent can not be set to self!');
		this._parent = parent;
		// In the case of a AnimationSequence parent, _startTime will be updated
		// by TimingGroup.splice().
		if (this.parent === null || this.parent.type !== "chain") {
			this._startTime = this._stashedStartTime === undefined ? 0.0 : this._stashedStartTime;
			this._stashedStartTime = undefined;
		}
		// In the case of the parent being non-null, _childrenStateModified() will
		// call this via _updateChildInheritedTimes().
		// TODO: Consider optimising this case by skipping this call.
		this._updateTimeMarkers();
		
	},
	_intrinsicDuration: function() {
		return 0.0;
	},
	_updateInternalState: function() {
		/*
		if (this.parent) {
			this.parent._childrenStateModified();
		} else if (this._player) {
			this._player._registerOnTimeline();
		}
		*/
		this._updateTimeMarkers();
	},
	/*
	_specifiedTimingModified: function() { // mutates
		console.log("specifiedTimingModified deprecated");
		enterModifyCurrentAnimationState();
		try {
			this._updateInternalState();
		} finally {
			exitModifyCurrentAnimationState( Boolean(this.player) && this.player._hasTicked);
		}
	},
	*/
	// We push time down to children. We could instead have children pull from
	// above, but this is tricky because a TimedItem may use either a parent
	// TimedItem or an Player. This requires either logic in
	// TimedItem, or for TimedItem and Player to implement Timeline
	// (or an equivalent), both of which are ugly.
	_updateInheritedTime: function(inheritedTime) {
		this._inheritedTime = inheritedTime;
		this._updateTimeMarkers();
	},
	_updateAnimationTime: function() {
		this._debugHasUpdatedAnimationTime = true;
		if (this.localTime < this.timing.delay) { // before start
			if (this.timing.fill === 'backwards' || this.timing.fill === 'both') this._animationTime = 0;
			else {
				 this._animationTime = null;
				this._debugAnimationTimeNullifiedBegin = true; 
			}
		} else if (this.localTime < this.timing.delay + this.activeDuration) { // running
			this._animationTime = this.localTime - this.timing.delay;
		} else { // finished
			if (this.timing.fill === 'forwards' || this.timing.fill === 'both') this._animationTime = this.activeDuration;
			else {
				this._animationTime = null;
				this._debugAnimationTimeNullifiedFinish = true;
			}
		}
	},
	_updateIterationParamsZeroDuration: function() {
		this._iterationTime = 0;
		var isAtEndOfIterations = this.timing._iterations() !== 0 && this.localTime >= this.timing.delay;
		this.currentIteration = (isAtEndOfIterations ?
			this._floorWithOpenClosedRange(this.timing.iterationStart + this.timing._iterations(), 1.0) :
			this._floorWithClosedOpenRange(this.timing.iterationStart, 1.0));
		// Equivalent to unscaledIterationTime below.
		var unscaledFraction = (isAtEndOfIterations ?
		this._modulusWithOpenClosedRange(this.timing.iterationStart + this.timing._iterations(), 1.0) :
			this._modulusWithClosedOpenRange(this.timing.iterationStart, 1.0));
		var timingFunction = this.timing._timingFunction(this);
		this._timeFraction = (this._isCurrentDirectionForwards() ? unscaledFraction : 1.0 - unscaledFraction);
		ASSERT_ENABLED && assert(this._timeFraction >= 0.0 && this._timeFraction <= 1.0, 'Time fraction should be in the range [0, 1]');
		if (timingFunction) {
			this._timeFraction = timingFunction.scaleTime(this._timeFraction);
		}
	},
	_getAdjustedAnimationTime: function(animationTime) {
		var startOffset = multiplyZeroGivesZero(this.timing.iterationStart, this.duration);
		return (this.timing.playbackRate < 0 ? (animationTime - this.activeDuration) : animationTime) * this.timing.playbackRate + startOffset;
	},
	_scaleIterationTime: function(unscaledIterationTime) {
		return this._isCurrentDirectionForwards() ? unscaledIterationTime : this.duration - unscaledIterationTime;
	},
	_updateIterationParams: function() {
		var adjustedAnimationTime = this._getAdjustedAnimationTime(this._animationTime);
		var repeatedDuration = this.duration * this.timing._iterations();
		var startOffset = this.timing.iterationStart * this.duration;
		var isAtEndOfIterations = (this.timing._iterations() !== 0) && (adjustedAnimationTime - startOffset === repeatedDuration);
		this.currentIteration = isAtEndOfIterations ? this._floorWithOpenClosedRange( adjustedAnimationTime, this.duration) : this._floorWithClosedOpenRange( adjustedAnimationTime, this.duration);
		var unscaledIterationTime = isAtEndOfIterations ? this._modulusWithOpenClosedRange( adjustedAnimationTime, this.duration) : this._modulusWithClosedOpenRange( adjustedAnimationTime, this.duration);
		this._iterationTime = this._scaleIterationTime(unscaledIterationTime);
		this._timeFraction = this._iterationTime / this.duration;
		ASSERT_ENABLED && assert(this._timeFraction >= 0.0 && this._timeFraction <= 1.0, 'Time fraction should be in the range [0, 1], got ' + this._timeFraction + ' ' + this._iterationTime + ' ' + this.duration + ' ' + isAtEndOfIterations + ' ' + unscaledIterationTime);
		var timingFunction = this.timing._timingFunction(this);
		if (timingFunction) this._timeFraction = timingFunction.scaleTime(this._timeFraction);
		this._iterationTime = this._timeFraction * this.duration;
	},
	_updateTimeMarkers: function() {
		//console.log("_updateTimeMarkers local:%s;",this.localTime);
		if (this.localTime === null) {
			this._animationTime = null;
			this._iterationTime = null;
			this.currentIteration = null;
			this._timeFraction = null;
			return false;
		}
		this._updateAnimationTime();
		if (this._animationTime === null) {
			this._iterationTime = null;
			this.currentIteration = null;
			this._timeFraction = null;
		} else if (this.duration === 0) {
			this._updateIterationParamsZeroDuration();
		} else {
			this._updateIterationParams();
		}
		maybeRestartAnimation();
	},
	_floorWithClosedOpenRange: function(x, range) {
		return Math.floor(x / range);
	},
	_floorWithOpenClosedRange: function(x, range) {
		return Math.ceil(x / range) - 1;
	},
	_modulusWithClosedOpenRange: function(x, range) {
		ASSERT_ENABLED && assert( range > 0, 'Range must be strictly positive');
		var modulus = x % range;
		var result = modulus < 0 ? modulus + range : modulus;
		ASSERT_ENABLED && assert( result >= 0.0 && result < range, 'Result should be in the range [0, range)');
		return result;
	},
	_modulusWithOpenClosedRange: function(x, range) {
		var modulus = this._modulusWithClosedOpenRange(x, range);
		var result = modulus === 0 ? range : modulus;
		ASSERT_ENABLED && assert( result > 0.0 && result <= range, 'Result should be in the range (0, range]');
		return result;
	},
	_isCurrentDirectionForwards: function() {
		if (this.timing.direction === 'normal') return true;
		if (this.timing.direction === 'reverse') return false;
		var d = this.currentIteration;
		if (this.timing.direction === 'alternate-reverse') d += 1;
		// TODO: 6.13.3 step 3. wtf?
		return d % 2 === 0;
	},
	clone: abstractMethod,
	// Gets the leaf TimedItems currently in effect. Note that this is a superset
	// of the leaf TimedItems in their active interval, as a TimedItem can have an
	// effect outside its active interval due to fill.
	_getLeafItemsInEffect: function(items) {
		this._getLeafItemsInEffectImpl(items); // need all animations so they can be removed in ticker. breaks backwards fill behavior so you must filter in ticker
	},
	_getLeafItemsInEffectImpl: abstractMethod,

	_hasFutureAnimation: function(timeDirectionForwards) {
		var future = timeDirectionForwards ? this._inheritedTime < this.endTime : this._inheritedTime > this.startTime;
		return future;
	},
	_isPastEndOfActiveInterval: function() { // TODO: shouldn't this also be time direction agnostic, like _hasFutureAnimation?
		var past = this._inheritedTime >= this.endTime;
		return past;
	},
	get player() {
		return this.parent === null ? this._player : this.parent.player;
	},
	_isCurrent: function() {
		var current = !this._isPastEndOfActiveInterval() || (this.parent !== null && this.parent._isCurrent());
		return current;
	},
	_isActive: function() {
		return (this.timing.fill === "both" || 
			((this.localTime >= this.timing.delay || this.timing.fill === "backwards") && 
			(this.localTime < this.timing.delay + this.activeDuration || this.timing.fill === "forwards"))
			
			// TODO: finish this. playback rate can be negative and direction can be reverse.
			
			/*
			(this._isCurrentDirectionForwards() && 
			(this.localTime >= this.timing.delay || this.timing.fill === "backwards") && 
			(this.localTime < this.timing.delay + this.activeDuration || this.timing.fill === "forwards")) ||
			
			(!this._isCurrentDirectionForwards() && 
			(this.localTime >= this.timing.delay || this.timing.fill === "backwards") && 
			(this.localTime < this.timing.delay + this.activeDuration || this.timing.fill === "forwards"))
			*/
		);
	},
	//_isTargetingElement: abstractMethod,
	//_getAnimationsTargetingElement: abstractMethod,
	_netEffectivePlaybackRate: function() {
		var effectivePlaybackRate = this._isCurrentDirectionForwards() ? this.timing.playbackRate : -this.timing.playbackRate;
		return this.parent === null ? effectivePlaybackRate : effectivePlaybackRate * this.parent._netEffectivePlaybackRate();
	},
	// Note that this restriction is currently incomplete - for example,
	// Animations which are playing forwards and have a fill of backwards
	// are not in effect unless current.
	// TODO: Complete this restriction.
	_hasFutureEffect: function() {	// TODO: does not take into account iterations. Should it?
			
			var effect =	this._isCurrent() || this.timing.fill === 'both' ||
			(this.timing.fill === 'backwards' && !this._isCurrentDirectionForwards()) ||
			(this.timing.fill === 'forwards' && this._isCurrentDirectionForwards());
		//console.log("hasFutureEffect:%s; current:%s;",effect,this._isCurrent());
		return effect;
	},
 
	get onstart() {
		return this._getOnHandler('start');
	},

	get oniteration() {
		return this._getOnHandler('iteration');
	},

	get onend() {
		return this._getOnHandler('end');
	},

	get oncancel() {
		return this._getOnHandler('cancel');
	},
	_setOnHandler: function(type, func) {
		if (typeof func === 'function') {
			this._onHandlers[type] = {
				callback: func,
				index: (this._handlers[type] || []).length
			};
			if (this.player) this._handlerAdded();
		} else {
			this._onHandlers[type] = null;
			this._checkForHandlers();
		}
	},
	_getOnHandler: function(type) {
		if (isDefinedAndNotNull(this._onHandlers[type])) return this._onHandlers[type].func;
		return null;
	},
	addEventListener: function(type, func) {
		if (typeof func !== 'function' || !(type === 'start' || type === 'iteration' || type === 'end' || type === 'cancel')) {
			return;
		}
		if (!isDefinedAndNotNull(this._handlers[type])) this._handlers[type] = [];
		else if (this._handlers[type].indexOf(func) !== -1) return;
	
		this._handlers[type].push(func);
		if (this.player) this._handlerAdded();
	},
	removeEventListener: function(type, func) {
		if (!this._handlers[type]) return;
		var index = this._handlers[type].indexOf(func);
		if (index === -1) return;
		this._handlers[type].splice(index, 1);
		if (isDefinedAndNotNull(this._onHandlers[type]) && (index < this._onHandlers[type].index)) {
			this._onHandlers[type].index -= 1;
		}
		this._checkForHandlers();
	},
	_hasHandlers: function() {
		return this._hasHandlersForEvent('start') || this._hasHandlersForEvent('iteration') ||
			this._hasHandlersForEvent('end') || this._hasHandlersForEvent('cancel');
	},
	_hasHandlersForEvent: function(type) {
		return (isDefinedAndNotNull(this._handlers[type]) && this._handlers[type].length > 0) || isDefinedAndNotNull(this._onHandlers[type]);
	},
	_callHandlers: function(type, event) {
		var callbackList;
		if (isDefinedAndNotNull(this._handlers[type])) callbackList = this._handlers[type].slice();
		else callbackList = [];
		if (isDefinedAndNotNull(this._onHandlers[type])) {
			callbackList.splice(this._onHandlers[type].index, 0, this._onHandlers[type].callback);
		}
		setTimeout(function() {
			for (var i = 0; i < callbackList.length; i++) {
				callbackList[i].call(this, event);
			}
		}, 0);
	},
		_handlerAdded: function() { // formerly Player
		this._needsHandlerPass = true;
	},
	_checkForHandlers: function() {// formerly Player
		this._needsHandlerPass = this._hasHandlers();
	},
	_generateChildEventsForRange: function() {},
	
	_toSubRanges: function(fromTime, toTime, iterationTimes) {
		if (fromTime > toTime) {
			var revRanges = this._toSubRanges(toTime, fromTime, iterationTimes);
			revRanges.ranges.forEach(function(a) { 
				a.reverse();
			});
			revRanges.ranges.reverse();
			revRanges.start = iterationTimes.length - revRanges.start - 1;
			revRanges.delta = -1;
			return revRanges;
		}
		var skipped = 0;
		// TODO: this should be calculatable. This would be more efficient
		// than searching through the list.
		while (iterationTimes[skipped] < fromTime) {
			skipped++;
		}
		var currentStart = fromTime;
		var ranges = [];
		for (var i = skipped; i < iterationTimes.length; i++) {
			if (iterationTimes[i] < toTime) {
				ranges.push([currentStart, iterationTimes[i]]);
				currentStart = iterationTimes[i];
			} else {
				ranges.push([currentStart, toTime]);
				return {start: skipped, delta: 1, ranges: ranges};
			}
		}
		ranges.push([currentStart, toTime]);
		return {start: skipped, delta: 1, ranges: ranges};
	},
	_generateEvents: function(fromTime, toTime, globalTime, deltaScale) {
		function toGlobal(time) {
			return (globalTime - (toTime - (time / deltaScale)));
		}
		var firstIteration = Math.floor(this.timing.iterationStart);
		var lastIteration = Math.floor(this.timing.iterationStart + this.timing.iterations);
		if (lastIteration === this.timing.iterationStart + this.timing.iterations) lastIteration -= 1;
		var startTime = this.startTime + this.timing.delay;
		if (this._hasHandlersForEvent('start')) {
			// Did we pass the start of this animation in the forward direction?
			if (fromTime <= startTime && toTime > startTime) {
				this._callHandlers('start', 
					new TimingEvent(PRIVATE, this, 'start', this.timing.delay, toGlobal(startTime), firstIteration));
				// Did we pass the end of this animation in the reverse direction?
			} else if (fromTime > this.endTime && toTime <= this.endTime) {
				this._callHandlers( 'start', new TimingEvent( PRIVATE, this, 'start', this.endTime - this.startTime, toGlobal(this.endTime), lastIteration) );
			}
		}

		// Calculate a list of uneased iteration times.
		var iterationTimes = [];
		for (var i = firstIteration + 1; i <= lastIteration; i++) {
			iterationTimes.push(i - this.timing.iterationStart);
		}
		iterationTimes = iterationTimes.map(function(i) {
			return i * this.duration / this.timing.playbackRate + startTime;
		}.bind(this));

		// Determine the impacted subranges.
		var clippedFromTime;
		var clippedToTime;
		if (fromTime < toTime) {
			clippedFromTime = Math.max(fromTime, startTime);
			clippedToTime = Math.min(toTime, this.endTime);
		} else {
			clippedFromTime = Math.min(fromTime, this.endTime);
			clippedToTime = Math.max(toTime, startTime);
		}
		var subranges = this._toSubRanges( clippedFromTime, clippedToTime, iterationTimes);

		for (var i = 0; i < subranges.ranges.length; i++) {
			var currentIter = subranges.start + i * subranges.delta;
			if (i > 0 && this._hasHandlersForEvent('iteration')) {
				var iterTime = subranges.ranges[i][0];
				this._callHandlers('iteration', new TimingEvent( PRIVATE, this, 'iteration', iterTime - this.startTime, toGlobal(iterTime), currentIter));
			}

			var iterFraction;
			if (subranges.delta > 0) iterFraction = this.timing.iterationStart % 1;
			else iterFraction = 1 - (this.timing.iterationStart + this.timing.iterations) % 1;

			this._generateChildEventsForRange(
				subranges.ranges[i][0], subranges.ranges[i][1],
				fromTime, toTime, currentIter - iterFraction,
				globalTime, deltaScale * this.timing.playbackRate);
		}

		if (this._hasHandlersForEvent('end')) {
			// Did we pass the end of this animation in the forward direction?
			if (fromTime < this.endTime && toTime >= this.endTime) {
				this._callHandlers( 'end', new TimingEvent( PRIVATE, this, 'end', this.endTime - this.startTime, toGlobal(this.endTime), lastIteration));
			// Did we pass the start of this animation in the reverse direction?
			} else if (fromTime >= startTime && toTime < startTime) {
				this._callHandlers( 'end', new TimingEvent( PRIVATE, this, 'end', this.timing.delay, toGlobal(startTime), firstIteration));
			}
		}
	}
};

var TimingEvent = function(token, target, type, localTime, timelineTime, iterationIndex, seeked) {
	if (token !== PRIVATE) throw new TypeError('Illegal constructor');
	this._target = target;
	this._type = type;
	this.localTime = localTime;
	this.timelineTime = timelineTime;
	this.iterationIndex = iterationIndex;
	this.seeked = seeked ? true : false;
};

TimingEvent.prototype = Object.create(window.Event.prototype, {
	target: { // TimingEvent
		get: function() {
			return this._target; // TimingEvent
		}
	},
	cancelable: {
		get: function() {
			return false;
		}
	},
	cancelBubble: {
		get: function() {
			return false;
		}
	},
	defaultPrevented: {
		get: function() {
			return false;
		}
	},
	eventPhase: {
		get: function() {
			return 0;
		}
	},
	type: {
		get: function() {
			return this._type;
		}
	}
});

var isEffectCallback = function(animationEffect) {
	return typeof animationEffect === 'function';
};

var interpretAnimationEffect = function(animationEffect) {
	if (animationEffect instanceof AnimationEffect || isEffectCallback(animationEffect)) {
		return animationEffect;
	} else if (isDefinedAndNotNull(animationEffect) && typeof animationEffect === 'object') {
		// The spec requires animationEffect to be an instance of
		// OneOrMoreKeyframes, but this type is just a dictionary or a list of
		// dictionaries, so the best we can do is test for an object.
		return new KeyframeEffect(animationEffect);
	}
	return null;
};

var cloneAnimationEffect = function(animationEffect, inverse) {
	if (animationEffect instanceof AnimationEffect) {
		if (inverse) return animationEffect.inverse();
		return animationEffect.clone();
	} else if (isEffectCallback(animationEffect)) {
		return animationEffect;
	} else {
		return null;
	}
};

var shallowObjectCopy = function(o) {
	return Object.keys(o).reduce(function(n, k){ n[k] = o[k]; return n;}, {});
}
function isNumber(w) {
	return !isNaN(parseFloat(w)) && isFinite(w);
}
	
function isArray(w) {
	return Array.isArray(w);
	//return Object.prototype.toString.call(w) === '[object Array]';
};
	
function isString(w) {
	return (typeof w == 'string' || w instanceof String);
}

function isFunction(w) {
	return w && {}.toString.call(w) === '[object Function]';
}

function WEB_ANIMATION() {}

/** @constructor */
var WebAnimation = function(token, animationEffect, timingInput) {
	if (token !== PRIVATE) throw new TypeError('Illegal constructor');
	enterModifyCurrentAnimationState();
	try {
		TimedItem.call(this, token, timingInput);
		this._setEffect(interpretAnimationEffect(animationEffect));
	} finally {
		exitModifyCurrentAnimationState(null);
	}
};

WebAnimation.prototype = createObject(TimedItem.prototype, {
	_resolveFillMode: function(fillMode) {
		return fillMode === 'auto' ? 'none' : fillMode;
	},
	_sample: function(target) {
		if (isDefinedAndNotNull(this.effect) && !(target instanceof PseudoElementReference)) {
			if (isEffectCallback(this.effect)) {
				this.effect(this._timeFraction, target, this);
			} else {
				this.effect._sample(this._timeFraction, this.currentIteration, target, this.underlyingValue);
			}
		}
	},
	_getLeafItemsInEffectImpl: function(items) {
		items.push(this);
	},
	
	_setEffect: function(effect) { // TODO: before you could mutate, the following code reflects that. maybe some can be removed
		this._effect = effect;
		this.timing._invalidateTimingFunction(); // might not be needed
	},
	get effect() {
		return this._effect;
	},
	_clone: function() {
		return new WebAnimation(PRIVATE, cloneAnimationEffect(this.effect), this.timing._dict);
	},
	_inverse: function() {
		return new WebAnimation(PRIVATE, cloneAnimationEffect(this.effect,true), this.timing._dict);
	},
	toString: function() {
		var effectString = '<none>';
		if (this.effect instanceof AnimationEffect) {
			effectString = this.effect.toString();
		} else if (isEffectCallback(this.effect)) {
			effectString = 'Effect callback';
		}
		return 'Animation ' + this.startTime + '-' + this.endTime + ' (' + this.localTime + ') ' + effectString;
	}
});

function HYPER_ANIMATION() {}

/** @constructor */
var HyperAnimation = function(description) { // TODO: separate basic and keyframe animations.
	enterModifyCurrentAnimationState();
	try {
	
		var dict = shallowObjectCopy(description); // need a copy!
		if (dict.ink !== "absolute") {
			if (!isDefinedAndNotNull(dict.easing)) dict.easing = "cubic-bezier(.5,0,.5,1)"; // default for relative animation
			if (!isDefinedAndNotNull(dict.fill)) dict.fill = "backwards"; // default for relative animation
		}
		// Mixed syntax of frames or from-to, or both.
		// This way you can actually get implicit keyframes
		// ...even if awkward and perhaps unusable
	
		var frames = dict.frames;
		if (!frames) frames = [];
		if (!frames[0]) {
			frames[0] = {offset:0};
			if (isDefinedAndNotNull(dict.from)) frames[0][dict.type] = dict.from;
		}
		if (!frames[1]) {
			frames[1] = {offset:1};
			if (isDefinedAndNotNull(dict.to)) frames[1][dict.type] = dict.to;
		}
		var ink = dict.ink;	
		var composite = dict.composite || ((ink !== "absolute") ? "add" : "replace"); // additive is default if ink is relative!
		var accumulate = dict.accumulate;
		var inverse = dict.inverse;
		var animationEffect = new KeyframeEffect(frames, composite, accumulate, ink, inverse);
		
		WebAnimation.call(this, PRIVATE, animationEffect, dict);

	} finally {
		exitModifyCurrentAnimationState(false);
	}
};

HyperAnimation.prototype = createObject(WebAnimation.prototype, {
	_clone: function() {
		var animation = new HyperAnimation(cloneAnimationEffect(this.effect), this._hyperDict);
		animation._startTime = this._startTime;
		return animation;
	},
	_inverse: function() {
		var animation = new HyperAnimation(cloneAnimationEffect(this.effect, true), this._hyperDict);
		animation._startTime = this._startTime;
		return animation;
	},
	toJSON: function() {
		return this.settings;
	}
});

function throwNewHierarchyRequestError() {
	var element = document.createElement('span');
	element.appendChild(element);
}



/** @constructor */
var TimedItemList = function(token, children) {
	if (token !== PRIVATE) throw new TypeError('Illegal constructor');
	this._children = children;
	this._getters = 0;
	this._ensureGetters();
};

TimedItemList.prototype = {
	get length() {
		return this._children.length;
	},
	_ensureGetters: function() {
		while (this._getters < this._children.length) {
			this._ensureGetter(this._getters++);
		}
	},
	_ensureGetter: function(i) {
		Object.defineProperty(this, i, {
			get: function() {
				return this._children[i];
			}
		});
	}
};

function TIMING_GROUP() {}

/** @constructor */
var TimingGroup = function(token, type, children, timing) {
	if (token !== PRIVATE) throw new TypeError('Illegal constructor');
	
	// Take a copy of the children array, as it could be modified as a side-effect
	// of creating this object. See
	// https://github.com/web-animations/web-animations-js/issues/65 for details.
	//var childrenCopy = (children && Array.isArray(children)) ? children.slice() : []; // original
	// used by TimedItem via _intrinsicDuration(), so needs to be set before
	// initializing super.
	this.type = type || 'group';
	//this._children = []; // orignal
	this._children = (children && Array.isArray(children)) ? children.slice(0) : [];
	this._cachedTimedItemList = null;
	this._cachedIntrinsicDuration = null;
	TimedItem.call(this, PRIVATE, timing);
	// We add children after setting the parent. This means that if an ancestor
	// (including the parent) is specified as a child, it will be removed from our
	// ancestors and used as a child,
	//this.append.apply(this, childrenCopy); // original
	
	// replacement for append:
	var i = this._children.length;
	while (i--) {
		var newChild = this._children[i];
		if (this._isInclusiveAncestor(newChild)) {
			throwNewHierarchyRequestError();
		}
		newChild._setParent(this);
	}
	
	// replacement for _childrenStateModified:
	
	// This calls up to our parent, then calls _updateTimeMarkers().
	this._updateInternalState();
	this._updateChildInheritedTimes();

	// Update child start times before walking down.
	this._updateChildStartTimes();
	this._checkForHandlers();
};

TimingGroup.prototype = createObject(TimedItem.prototype, {
	/*
	_hasFutureAnimation: function(playbackRate) { // from Player
		if (playbackRate === 0) return false;
		var animations = this._children;
		var i = animations.length;
		while (i--) {
			if (animations[i]._hasFutureAnimation(playbackRate > 0)) return true;
		}
		return false;
	},
	_isPastEndOfActiveInterval: function() { // from Player
		var animations = this._children;
		var i = animations.length;
		while (i--) {
			if (!animations[i]._isPastEndOfActiveInterval()) return false;
		}
		return true;
	},
	_isCurrent: function() { // from Player
		var animations = this._children;
		var i = animations.length;
		while (i--) {
			if (animations[i]._isCurrent()) return true;
		}
		return false;
	},
	_hasFutureEffect: function() { // from Player
		var animations = this._children;
		var i = animations.length;
		while (i--) {
			if (animations[i]._hasFutureEffect()) return true;
		}
		return false;
	},
	_isActive: function() { // from Player but not really
		var animations = this._children;
		var i = animations.length;
		while (i--) {
			if (animations[i]._isActive()) return true;
		}
		return false;
	},
	*/
	
	_sample: function(target) {
		var animations = this._children;
		animations.forEach(function(animation) {
			if (animation._isActive()) {
				animation._sample(target);
			}
		});
	},
	/*
	_childrenStateModified: function() {
		// See _updateChildStartTimes().
		this._isInChildrenStateModified = true;
		if (this._cachedTimedItemList) this._cachedTimedItemList._ensureGetters();
		this._cachedIntrinsicDuration = null;

		// We need to walk up and down the tree to re-layout. endTime and the
		// various durations (which are all calculated lazily) are the only
		// properties of a TimedItem which can affect the layout of its ancestors.
		// So it should be sufficient to simply update start times and time markers
		// on the way down.

		// This calls up to our parent, then calls _updateTimeMarkers().
		this._updateInternalState();
		this._updateChildInheritedTimes();

		// Update child start times before walking down.
		this._updateChildStartTimes();
		this._checkForHandlers();
		this._isInChildrenStateModified = false;
	},
	*/
	_updateInheritedTime: function(inheritedTime) {
		this._inheritedTime = inheritedTime;
		this._updateTimeMarkers();
		this._updateChildInheritedTimes();
	},
	_updateChildInheritedTimes: function() {
		for (var i = 0; i < this._children.length; i++) {
			var child = this._children[i];
			child._updateInheritedTime(this._iterationTime);
		}
	},
	
	_updateChildStartTimes: function() {
		if (this.type === 'chain') { // for copying animations you need to handle group as well
			var cumulativeStartTime = 0;
			for (var i = 0; i < this._children.length; i++) {
				var child = this._children[i];
				if (child._stashedStartTime === undefined) {
					child._stashedStartTime = child._startTime;
				}
				child._startTime = cumulativeStartTime;
				// Avoid updating the child's inherited time and time markers if this is
				// about to be done in the down phase of _childrenStateModified().
				if (!child._isInChildrenStateModified) {
					// This calls _updateTimeMarkers() on the child.
					child._updateInheritedTime(this._iterationTime);
				}
				cumulativeStartTime += Math.max(0, child.timing.delay + child.activeDuration + child.timing.endDelay);
			}
		}
	},
	
	get children() {
		if (!this._cachedTimedItemList) this._cachedTimedItemList = new TimedItemList( PRIVATE, this._children);
		return this._cachedTimedItemList;
	},
	get firstChild() {
		return this._children[0];
	},
	get lastChild() {
		return this._children[this.children.length - 1];
	},
	_intrinsicDuration: function() {
		if (!isDefinedAndNotNull(this._cachedIntrinsicDuration)) {
			if (this.type === 'group') {
				var dur = Math.max.apply(undefined, this._children.map(function(a) {
					return a.endTime;
				}));
				this._cachedIntrinsicDuration = Math.max(0, dur);
			} else if (this.type === 'chain') {
				var result = 0;
				this._children.forEach(function(a) {
					result += a.activeDuration + a.timing.delay + a.timing.endDelay;
				});
				this._cachedIntrinsicDuration = result;
			} else {
				throw 'Unsupported type ' + this.type;
			}
		}
		return this._cachedIntrinsicDuration;
	},
	_getLeafItemsInEffectImpl: function(items) {
		for (var i = 0; i < this._children.length; i++) {
			this._children[i]._getLeafItemsInEffect(items);
		}
	},
	_clone: function() {
		var children = [];
		this._children.forEach(function(child) {
			children.push(child._clone());
		});
		return this.type === 'group' ?
			new HyperAnimationGroup(children, this.timing._dict) :
			new HyperAnimationChain(children, this.timing._dict);
	},
	indexOf: function(item) {
		return this._children.indexOf(item);
	},
	/*
	append: function() {
		var newItems = [];
		for (var i = 0; i < arguments.length; i++) {
			newItems.push(arguments[i]);
		}
		this._splice(this._children.length, 0, newItems);
	},
	_splice: function(start, deleteCount, newItems) {
		enterModifyCurrentAnimationState();
		try {
			var args = arguments;
			if (args.length === 3) {
				args = [start, deleteCount].concat(newItems);
			}
			for (var i = 2; i < args.length; i++) {
				var newChild = args[i];
				if (this._isInclusiveAncestor(newChild)) {
					throwNewHierarchyRequestError();
				}
				newChild._setParent(this);
			}
			var result = Array.prototype.splice.apply(this._children, args);
			for (var i = 0; i < result.length; i++) {
				result[i]._parent = null;
			}
			this._childrenStateModified();
			return result;
		} finally {
			exitModifyCurrentAnimationState( Boolean(this.player) ? repeatLastTick : null);
		}
	},
	*/
	_isInclusiveAncestor: function(item) {
		for (var ancestor = this; ancestor !== null; ancestor = ancestor.parent) {
			if (ancestor === item) return true;
		}
		return false;
	},
	/*
	_isTargetingElement: function(element) { // Useless. A group can only target one element.
		return this._children.some(function(child) {
			return child._isTargetingElement(element);
		});
	},
	_getAnimationsTargetingElement: function(element, animations) { // Useless. A group can only target one element. The answer is all or none.
		this._children.map(function(child) {
			return child._getAnimationsTargetingElement(element, animations);
		});
	},
	*/
	toString: function() {
		return this.type + ' ' + this.startTime + '-' + this.endTime + ' (' +
			this.localTime + ') ' + ' [' + this._children.map(function(a) { return a.toString(); }) + ']';
	},
	_hasHandlers: function() {
		return TimedItem.prototype._hasHandlers.call(this) || (
			this._children.length > 0 && this._children.reduce(
			function(a, b) { return a || b._hasHandlers(); }, false));
	},
	_generateChildEventsForRange: function(localStart, localEnd, rangeStart, rangeEnd, iteration, globalTime, deltaScale) {
		var start;
		var end;
		if (localEnd - localStart > 0) {
			start = Math.max(rangeStart, localStart);
			end = Math.min(rangeEnd, localEnd);
			if (start >= end) return;
		} else {
			start = Math.min(rangeStart, localStart);
			end = Math.max(rangeEnd, localEnd);
			if (start <= end) return;
		}

		var endDelta = rangeEnd - end;
		start -= iteration * this.duration / deltaScale;
		end -= iteration * this.duration / deltaScale;

		for (var i = 0; i < this._children.length; i++) {
			this._children[i]._generateEvents( start, end, globalTime - endDelta, deltaScale);
		}
	}
});

function HYPER_ANIMATION_GROUP() {}
/** @constructor */
var HyperAnimationGroup = function(description) {
	var children = [];
	if (Array.isArray(description.children)) children = description.children;
	var animations = [];
	var length = children.length
	for (var i=0; i<length; i++) {
		animations.push(kxdxAnimationFromDescription(children[i],2));
	}
	TimingGroup.call(this, PRIVATE, "group", animations, description);
};
HyperAnimationGroup.prototype = Object.create(TimingGroup.prototype);


function HYPER_ANIMATION_CHAIN() {}
/** @constructor */
var HyperAnimationChain = function(description) {
	var children = [];
	if (Array.isArray(description.children)) children = description.children;
	var animations = [];
	var length = children.length
	for (var i=0; i<length; i++) {
		animations.push(kxdxAnimationFromDescription(children[i],1));
	}
	TimingGroup.call(this, PRIVATE, "chain", animations, description);
};
HyperAnimationChain.prototype = Object.create(TimingGroup.prototype);



/** @constructor */
var PseudoElementReference = function(element, pseudoElement) {
	this.element = element;
	this.pseudoElement = pseudoElement;
	console.warn('PseudoElementReference is not supported.');
};





function ANIMATION_EFFECT() {}

/** @constructor */
var AnimationEffect = function(token, accumulate) {
	var verbose = false;
	if (token !== PRIVATE) throw new TypeError('Illegal constructor');
	enterModifyCurrentAnimationState();
	try {
		this._accumulate = accumulate === 'sum' ? accumulate : 'none';
		if (verbose) console.log("AnimationEffect accumulate:%s;",accumulate);
	} finally {
		exitModifyCurrentAnimationState(false);
	}
};

AnimationEffect.prototype = {
	get accumulate() {
		return this._accumulate;
	},
	_sample: abstractMethod,
	clone: abstractMethod,
	toString: abstractMethod
};

var clamp = function(x, min, max) {
	return Math.max(Math.min(x, max), min);
};


var HYPER_MOTION_PATH_EFFECT = function() {}

/** @constructor */
var HyperMotionPathEffect = function(path, autoRotate, angle, composite, accumulate) { // TODO: This is no longer possible with HyperAnimation only allowing single description argument
	enterModifyCurrentAnimationState();
	try {
		AnimationEffect.call(this, PRIVATE, accumulate);
		this._composite = composite === 'add' ? composite : 'replace';

		// TODO: path argument is not in the spec -- seems useful since
		// SVGPathSegList doesn't have a constructor.
		this._autoRotate = String(isDefined(autoRotate) ? autoRotate : 'none');
		this._angle = Number(isDefined(angle) ? angle : 0);

		this._path = document.createElementNS(SVG_NS, 'path');
		if (path instanceof SVGPathSegList) {
			this._setSegments(path);
		} else {
			var tempPath = document.createElementNS(SVG_NS, 'path');
			tempPath.setAttribute('d', String(path));
			this._setSegments(tempPath.pathSegList);
		}
	} finally {
		exitModifyCurrentAnimationState(false);
	}
};

HyperMotionPathEffect.prototype = createObject(AnimationEffect.prototype, {
	get composite() {
		return this._composite;
	},
	
	_sample: function(timeFraction, currentIteration, target) { // HyperMotionPathEffect
		// TODO: Handle accumulation.
		var lengthAtTimeFraction = this._lengthAtTimeFraction(timeFraction);
		var point = this._path.getPointAtLength(lengthAtTimeFraction);
		var x = point.x - target.offsetWidth / 2; // AnimationEffect
		var y = point.y - target.offsetHeight / 2; // AnimationEffect
		// TODO: calc(point.x - 50%) doesn't work?
		var value = [{t: 'translate', d: [{px: x}, {px: y}]}];
		var angle = this.angle;
		if (this._autoRotate === 'auto-rotate') {
			// Super hacks
			var lastPoint = this._path.getPointAtLength(lengthAtTimeFraction - 0.01);
			var dx = point.x - lastPoint.x;
			var dy = point.y - lastPoint.y;
			var rotation = Math.atan2(dy, dx);
			angle += rotation / 2 / Math.PI * 360;
		}
		value.push({t: 'rotate', d: [angle]});
		var keyframeBecauseItsComplicated = new PropertySpecificKeyframe(-1, "transform", null, value); // (offset, property, cssValue, optionalRawValue) // AddReplaceCompositableValue now requires a keyframe, not a rawValue, because state animation needed extra info to compositeOnto. TODO: Something other than a keyframe
		// AddReplaceCompositableValue (propertySpecificKeyframe, composite, optionalTimeFractionForStateAnimation)
		compositor.setAnimatedValue(target, 'transform', new AddReplaceCompositableValue(keyframeBecauseItsComplicated, this.composite));
	},
	_lengthAtTimeFraction: function(timeFraction) {
		var segmentCount = this._cumulativeLengths.length - 1;
		if (!segmentCount) return 0;
		var scaledFraction = timeFraction * segmentCount;
		var index = clamp(Math.floor(scaledFraction), 0, segmentCount);
		return this._cumulativeLengths[index] + ((scaledFraction % 1) * (
			this._cumulativeLengths[index + 1] - this._cumulativeLengths[index]));
	},
	clone: function() {
		return new HyperMotionPathEffect(this._path.getAttribute('d'));
	},
	toString: function() {
		return '<HyperMotionPathEffect>';
	},
	get autoRotate() {
		return this._autoRotate;
	},
	get angle() {
		return this._angle;
	},
	
	_setSegments: function(segments) {
		var targetSegments = this.segments;
		targetSegments.clear();
		var cumulativeLengths = [0];
		// TODO: *moving* the path segments is not correct, but pathSegList is read only
		var items = segments.numberOfItems;
		while (targetSegments.numberOfItems < items) {
			var segment = segments.removeItem(0);
			targetSegments.appendItem(segment);
			if (segment.pathSegType !== SVGPathSeg.PATHSEG_MOVETO_REL && segment.pathSegType !== SVGPathSeg.PATHSEG_MOVETO_ABS) {
				cumulativeLengths.push(this._path.getTotalLength());
			}
		}
		this._cumulativeLengths = cumulativeLengths;
	},
	get segments() {
		return this._path.pathSegList;
	}
});

var shorthandToLonghand = {
	background: [
		'backgroundImage',
		'backgroundPosition',
		'backgroundSize',
		'backgroundRepeat',
		'backgroundAttachment',
		'backgroundOrigin',
		'backgroundClip',
		'backgroundColor'
	],
	border: [
		'borderTopColor',
		'borderTopStyle',
		'borderTopWidth',
		'borderRightColor',
		'borderRightStyle',
		'borderRightWidth',
		'borderBottomColor',
		'borderBottomStyle',
		'borderBottomWidth',
		'borderLeftColor',
		'borderLeftStyle',
		'borderLeftWidth'
	],
	borderBottom: [
		'borderBottomWidth',
		'borderBottomStyle',
		'borderBottomColor'
	],
	borderColor: [
		'borderTopColor',
		'borderRightColor',
		'borderBottomColor',
		'borderLeftColor'
	],
	borderLeft: [
		'borderLeftWidth',
		'borderLeftStyle',
		'borderLeftColor'
	],
	borderRadius: [
		'borderTopLeftRadius',
		'borderTopRightRadius',
		'borderBottomRightRadius',
		'borderBottomLeftRadius'
	],
	borderRight: [
		'borderRightWidth',
		'borderRightStyle',
		'borderRightColor'
	],
	borderTop: [
		'borderTopWidth',
		'borderTopStyle',
		'borderTopColor'
	],
	borderWidth: [
		'borderTopWidth',
		'borderRightWidth',
		'borderBottomWidth',
		'borderLeftWidth'
	],
	font: [
		'fontFamily',
		'fontSize',
		'fontStyle',
		'fontVariant',
		'fontWeight',
		'lineHeight'
	],
	margin: [
		'marginTop',
		'marginRight',
		'marginBottom',
		'marginLeft'
	],
	outline: [
		'outlineColor',
		'outlineStyle',
		'outlineWidth'
	],
	padding: [
		'paddingTop',
		'paddingRight',
		'paddingBottom',
		'paddingLeft'
	]
};

// This delegates parsing shorthand value syntax to the browser.
var shorthandExpanderElem = createDummyElement();
var expandShorthand = function(property, value, result) {
	shorthandExpanderElem.style[property] = value;
	var longProperties = shorthandToLonghand[property];
	for (var i in longProperties) {
		var longProperty = longProperties[i];
		var longhandValue = shorthandExpanderElem.style[longProperty];
		result[longProperty] = longhandValue;
	}
};

var normalizeKeyframeDictionary = function(properties) {
	// not using this prevents expansion of shorthand to longhand
	var result = {
		offset: null,
	};
	var animationProperties = [];
	for (var property in properties) {
		// TODO: Apply the CSS property to IDL attribute algorithm.
		if (property === 'offset') {
			if (typeof properties.offset === 'number') {
				result.offset = properties.offset;
			}
		} else {
			// TODO: Check whether this is a supported property.
			animationProperties.push(property);
		}
	}
	// TODO: Remove prefixed properties if the unprefixed version is also
	// supported and present. // Vendor prefix
	for (var i = 0; i < animationProperties.length; i++) {
		// TODO: Apply the IDL attribute to CSS property algorithm.
		var property = animationProperties[i];
		// TODO: The spec does not specify how to handle null values.
		// See https://www.w3.org/Bugs/Public/show_bug.cgi?id=22572
		//var value = isDefinedAndNotNull(properties[property]) ? properties[property].toString() : ''; // original
		var value = isDefinedAndNotNull(properties[property]) ? properties[property] : ''; // modified. Don't want to turn arrays into strings. Unsure about side effects
		if (property in shorthandToLonghand) {
			expandShorthand(property, value, result); // TODO: value is no longer a guaranteed to be string
		} else {
			result[property] = value;
		}
	}
	return result;
};



var transformKeyframeVerbose = false;
	
	
function KEYFRAME_EFFECT() {

}
/** @constructor */
var KeyframeEffect = function(oneOrMoreKeyframeDictionaries, composite, accumulate, ink, inversed) {
	enterModifyCurrentAnimationState();
	try {
		AnimationEffect.call(this, PRIVATE, accumulate);

		this._composite = composite === 'add' ? composite : 'replace';
		this._ink = ink === "absolute" ? ink : "relative"
		this._inversed = inversed;

		this._setFrames(oneOrMoreKeyframeDictionaries);
	} finally {
		exitModifyCurrentAnimationState(false);
	}
};

KeyframeEffect.prototype = createObject(AnimationEffect.prototype, {
	get composite() {
		return this._composite;
	},
	get ink() {
		return this._ink;
	},
	getFrames: function() {
		return this._keyframeDictionaries.slice(0);
	},
	_setFrames: function(oneOrMoreKeyframeDictionaries) {
		if (!Array.isArray(oneOrMoreKeyframeDictionaries)) {
			oneOrMoreKeyframeDictionaries = [oneOrMoreKeyframeDictionaries];
		}
		var keyframes = oneOrMoreKeyframeDictionaries.map(normalizeKeyframeDictionary);
		this._keyframeDictionaries = keyframes;
		// Set lazily
		this._cachedPropertySpecificKeyframes = null;
	},
	
	_sample: function(timeFraction, currentIteration, target) {
		var frames = this._propertySpecificKeyframes();
		for (var property in frames) {
			var sample = this._sampleForProperty(frames[property], timeFraction, currentIteration);
			//console.log("sample:%s;",JSON.stringify(sample));
			//sample:{"startValue":{"value":[{"t":"translate3d","d":[{"px":0},{"px":36},{"px":0}]}],"typeObject":{},"composite":"add"},"endValue":{"value":[{"t":"translate3d","d":[{"px":0},{"px":0},{"px":0}]}],"typeObject":{},"composite":"add"},"fraction":0.9979470289616761};
			compositor.setAnimatedValue(target, property, sample);
		}
	},
	_sampleForProperty: function(frames, timeFraction, currentIteration) {
		var unaccumulatedValue = this._getUnaccumulatedValue(frames, timeFraction);
		// We can only accumulate if this iteration is strictly positive and if all
		// keyframes use the same composite operation.
		if (this.accumulate === 'sum' && currentIteration > 0) {
			// TODO: The spec is vague about the order of addition here when using add composition.
			return new AccumulatedCompositableValue(unaccumulatedValue, this._getAccumulatingValue(frames), currentIteration);
		}

		return unaccumulatedValue;
	},
	_getAccumulatingValue: function(frames) {
		// This is a BlendedCompositableValue, though because the offset is 1.0, we
		// could simplify it to an AddReplaceCompositableValue representing the
		// keyframe at offset 1.0. We don't do this because the spec is likely to
		// change such that there is no guarantee that a keyframe with offset 1.0 is
		// present.
		// TODO: Consider caching this.
		var unaccumulatedValueAtOffsetOne = this._getUnaccumulatedValue(frames, 1.0);
		if (this.composite === "add") return unaccumulatedValueAtOffsetOne;

		// For replace composition, we must evaluate the BlendedCompositableValue
		// to get a concrete value (note that the choice of underlying value is
		// irrelevant since it uses replace composition). We then form a new
		// AddReplaceCompositable value to add-composite this concrete value.
		ASSERT_ENABLED && assert(!unaccumulatedValueAtOffsetOne.dependsOnUnderlyingValue());
		return new AddReplaceCompositableValue(unaccumulatedValueAtOffsetOne.compositeOnto(null, null), 'add');
	},
	_getUnaccumulatedValue: function(frames, timeFraction) {
		ASSERT_ENABLED && assert( frames.length >= 2, 'Interpolation requires at least two keyframes');
		var startKeyframeIndex;
		var length = frames.length;
		// We extrapolate differently depending on whether or not there are multiple
		// keyframes at offsets of 0 and 1.
		if (timeFraction < 0.0) {
			if (frames[1].offset === 0.0) {
				return new AddReplaceCompositableValue(frames[0], this.composite); // (propertySpecificKeyframe, composite, optionalTimeFractionForStateAnimation)
			} else {
				startKeyframeIndex = 0;
			}
		} else if (timeFraction >= 1.0) {
			if (frames[length - 2].offset === 1.0) {
				return new AddReplaceCompositableValue(frames[length - 1], this.composite); // (propertySpecificKeyframe, composite, optionalTimeFractionForStateAnimation)
			} else {
				startKeyframeIndex = length - 2;
			}
		} else {
			for (var i = length - 1; i >= 0; i--) {
				if (frames[i].offset <= timeFraction) {
					ASSERT_ENABLED && assert(frames[i].offset !== 1.0);
					startKeyframeIndex = i;
					break;
				}
			}
		}
		var startKeyframe = frames[startKeyframeIndex];
		var endKeyframe = frames[startKeyframeIndex + 1];

		var optionalTimeFractionForStateAnimation = timeFraction;
		if (startKeyframe.offset === timeFraction) {
			return new AddReplaceCompositableValue(startKeyframe, this.composite, optionalTimeFractionForStateAnimation); // (propertySpecificKeyframe, composite, optionalTimeFractionForStateAnimation)
		}
		if (endKeyframe.offset === timeFraction) {
			return new AddReplaceCompositableValue(endKeyframe, this.composite, optionalTimeFractionForStateAnimation); // (propertySpecificKeyframe, composite, optionalTimeFractionForStateAnimation)
		}
		var intervalDistance = (timeFraction - startKeyframe.offset) / (endKeyframe.offset - startKeyframe.offset);
		return new BlendedCompositableValue(
			new AddReplaceCompositableValue(startKeyframe, this.composite), // (propertySpecificKeyframe, composite, optionalTimeFractionForStateAnimation)
			new AddReplaceCompositableValue(endKeyframe, this.composite), // (propertySpecificKeyframe, composite, optionalTimeFractionForStateAnimation)
			intervalDistance);
	},
	
	_propertySpecificKeyframes: function() {
		if (isDefinedAndNotNull(this._cachedPropertySpecificKeyframes)) {
			return this._cachedPropertySpecificKeyframes;
		}
		this._cachedPropertySpecificKeyframes = {};
		var distributedFrames = this._getDistributedKeyframes();
		var length = distributedFrames.length;
		if (this.ink === "relative") {
			var lastFrame = distributedFrames[length - 1];
			var i = length;
			while (i--) {
				var frame = distributedFrames[i];
				for (var property in frame.cssValues) { // a value for all properties must be specified for all frames.
					if (!(property in this._cachedPropertySpecificKeyframes)) this._cachedPropertySpecificKeyframes[property] = [];
					var lastCssValue = lastFrame.cssValues[property];
					if (lastCssValue === undefined || lastCssValue === null) {
						lastCssValue = rawNeutralValue;
					}
					var typeObject = getType(property, lastCssValue);
					//var lastRawValue = fromCssValue(property, lastCssValue);
					var lastRawValue = typeObject.fromCssValue(lastCssValue);
					var specifiedCssValue = frame.cssValues[property];
					if (specifiedCssValue === undefined || specifiedCssValue === null) { // cannot happen because the property is in frame.cssValues
						specifiedCssValue = rawNeutralValue;
					}
					//var specifiedRawValue = fromCssValue(property, specifiedCssValue);
					var specifiedRawValue = typeObject.fromCssValue(specifiedCssValue);
					var actualRawValue = typeObject.subtract(specifiedRawValue, lastRawValue);
					if (this._inversed) actualRawValue = typeObject.inverse(actualRawValue);
					var actualCssValue = typeObject.toCssValue(actualRawValue);
					var propertyKeyframe = new PropertySpecificKeyframe(frame.offset, property, actualCssValue, actualRawValue); // (offset, property, cssValue, optionalRawValue)
					this._cachedPropertySpecificKeyframes[property].unshift(propertyKeyframe);
				}
			}
		} else {
			for (var i = 0; i < length; i++) {
				var frame = distributedFrames[i];
				for (var property in frame.cssValues) {
					if (!(property in this._cachedPropertySpecificKeyframes)) {
			 			this._cachedPropertySpecificKeyframes[property] = [];
					}
					var propertyKeyframe = new PropertySpecificKeyframe(frame.offset, property, frame.cssValues[property]); // (offset, property, cssValue, optionalRawValue)
					this._cachedPropertySpecificKeyframes[property].push(propertyKeyframe);
				}
			}
		}
		for (var property in this._cachedPropertySpecificKeyframes) {
			var frames = this._cachedPropertySpecificKeyframes[property];
			ASSERT_ENABLED && assert( frames.length > 0, 'There should always be keyframes for each property');

			// Add synthetic keyframes at offsets of 0 and 1 if required.
			if (frames[0].offset !== 0.0) {
				var keyframe = new PropertySpecificKeyframe(0.0, property, cssNeutralValue); // (offset, property, cssValue, optionalRawValue)	 
				frames.unshift(keyframe);
			}
			if (frames[frames.length - 1].offset !== 1.0) {
				var keyframe = new PropertySpecificKeyframe(1.0, property, cssNeutralValue); // (offset, property, cssValue, optionalRawValue)
				frames.push(keyframe);
			}
			ASSERT_ENABLED && assert(frames.length >= 2, 'There should be at least two keyframes including' + ' synthetic keyframes');
		}
		return this._cachedPropertySpecificKeyframes;
	},
	clone: function() {
			var result = new KeyframeEffect([], this.composite, this.accumulate, this.ink, this._inversed);
			result._keyframeDictionaries = this._keyframeDictionaries.slice(0);
			return result;
	},
	inverse: function() {
			var result = new KeyframeEffect([], this.composite, this.accumulate, this.ink, !this._inversed);
			result._keyframeDictionaries = this._keyframeDictionaries.slice(0);
			return result;
	},
	
	toString: function() {
			return '<KeyframeEffect>';
	},
	
	
	_areKeyframeDictionariesLooselySorted: function() {
		var previousOffset = -Infinity;
		for (var i = 0; i < this._keyframeDictionaries.length; i++) {
			if (isDefinedAndNotNull(this._keyframeDictionaries[i].offset)) {
				if (this._keyframeDictionaries[i].offset < previousOffset) return false;
				previousOffset = this._keyframeDictionaries[i].offset;
			}
		}
		return true;
	},
	// The spec describes both this process and the process for interpretting the
	// properties of a keyframe dictionary as 'normalizing'. Here we use the term
	// 'distributing' to avoid confusion with normalizeKeyframeDictionary().
	_getDistributedKeyframes: function() {
		if (!this._areKeyframeDictionariesLooselySorted()) return [];

		var distributedKeyframes = this._keyframeDictionaries.map( KeyframeInternal.createFromNormalizedProperties );

		// Remove keyframes with offsets out of bounds.
		var length = distributedKeyframes.length;
		var count = 0;
		for (var i = 0; i < length; i++) {
			var offset = distributedKeyframes[i].offset;
			if (isDefinedAndNotNull(offset)) {
				if (offset >= 0) break;
				else count = i;
			}
		}
		distributedKeyframes.splice(0, count);

		length = distributedKeyframes.length;
		count = 0;
		for (var i = length - 1; i >= 0; i--) {
			var offset = distributedKeyframes[i].offset;
			if (isDefinedAndNotNull(offset)) {
				if (offset <= 1) break;
				else count = length - i;
			}
		}
		distributedKeyframes.splice(length - count, count);

		// Distribute offsets.
		length = distributedKeyframes.length;
		if (length > 1 && !isDefinedAndNotNull(distributedKeyframes[0].offset)) {
			distributedKeyframes[0].offset = 0;
		}
		if (!isDefinedAndNotNull(distributedKeyframes[length - 1].offset)) {
			distributedKeyframes[length - 1].offset = 1;
		}
		var lastOffsetIndex = 0;
		var nextOffsetIndex = 0;
		for (var i = 1; i < distributedKeyframes.length - 1; i++) {
			var keyframe = distributedKeyframes[i];
			if (isDefinedAndNotNull(keyframe.offset)) {
				lastOffsetIndex = i;
				continue;
			}
			if (i > nextOffsetIndex) {
				nextOffsetIndex = i;
				while (!isDefinedAndNotNull( distributedKeyframes[nextOffsetIndex].offset)) {
					nextOffsetIndex++;
				}
			}
			var lastOffset = distributedKeyframes[lastOffsetIndex].offset;
			var nextOffset = distributedKeyframes[nextOffsetIndex].offset;
			var unspecifiedKeyframes = nextOffsetIndex - lastOffsetIndex - 1;
			ASSERT_ENABLED && assert(unspecifiedKeyframes > 0);
			var localIndex = i - lastOffsetIndex;
			ASSERT_ENABLED && assert(localIndex > 0);
			distributedKeyframes[i].offset = lastOffset + (nextOffset - lastOffset) * localIndex / (unspecifiedKeyframes + 1);
		}

		// Remove invalid property values.
		for (var i = distributedKeyframes.length - 1; i >= 0; i--) {
			var keyframe = distributedKeyframes[i];
			for (var property in keyframe.cssValues) {
				if (!KeyframeInternal.isSupportedPropertyValue(keyframe.cssValues[property])) {
					delete(keyframe.cssValues[property]);
				}
			}
			if (Object.keys(keyframe).length === 0) {
				distributedKeyframes.splice(i, 1);
			}
		}

		return distributedKeyframes;
	}
});




function KEYFRAME_INTERNAL() {

}
/**
 * An internal representation of a keyframe. The Keyframe type from the spec is
 * just a dictionary and is not exposed.
 *
 * @constructor
 */
var KeyframeInternal = function(offset) {//, composite) {
	ASSERT_ENABLED && assert( typeof offset === 'number' || offset === null, 'Invalid offset value');
	this.offset = offset;
	this.cssValues = {};
};

KeyframeInternal.prototype = {
	addPropertyValuePair: function(property, value) {
		ASSERT_ENABLED && assert(!this.cssValues.hasOwnProperty(property));
		this.cssValues[property] = value;
	},
	hasValueForProperty: function(property) {
		return property in this.cssValues;
	}
};

KeyframeInternal.isSupportedPropertyValue = function(value) {
	ASSERT_ENABLED && assert(typeof value === 'string' || value === cssNeutralValue);
	// TODO: Check this properly!
	return value !== '';
};

KeyframeInternal.createFromNormalizedProperties = function(properties) {
	ASSERT_ENABLED && assert(isDefinedAndNotNull(properties) && typeof properties === 'object', 'Properties must be an object');
	var keyframe = new KeyframeInternal(properties.offset);
	for (var candidate in properties) {
		if (candidate !== 'offset') {
			keyframe.addPropertyValuePair(candidate, properties[candidate]);
		}
	}
	return keyframe;
};


function PROPERTY_SPECIFIC_KEYFRAME() {

}

/** @constructor */
var PropertySpecificKeyframe = function(offset, property, cssValue, optionalRawValue) {
	this.offset = offset;
	this.property = property;
	this.cssValue = cssValue;
	// Calculated lazily unless relative conversion does first
	this.cachedRawValue = (optionalRawValue) ? optionalRawValue : null;
};

PropertySpecificKeyframe.prototype = {
	rawValue: function() {
		if (!isDefinedAndNotNull(this.cachedRawValue)) {
			//this.cachedRawValue = fromCssValue(this.property, this.cssValue);
			var typeObject = getType(this.property,this.cssValue);
			this.cachedRawValue = typeObject.fromCssValue(this.cssValue);
		}
		return this.cachedRawValue;
	}
};



	
function TIMING_FUNCTION () {}

/** @constructor */
var TimingFunction = function() {
	throw new TypeError('Illegal constructor');
};

TimingFunction.prototype.scaleTime = abstractMethod;

TimingFunction.createFromString = function(spec, timedItem) {
	//if (isFunction(spec)) return presetTimingFunctions.linear; // original
		if (isFunction(spec)) return new CustomTimingFunction(spec);
	var preset = presetTimingFunctions[spec];
	if (preset) {
		return preset;
	}
	if (spec === 'paced') {
		if (timedItem instanceof WebAnimation &&
				timedItem.effect instanceof HyperMotionPathEffect) {
			return new PacedTimingFunction(timedItem.effect);
		}
		return presetTimingFunctions.linear;
	}
	var stepMatch = /steps\(\s*(\d+)\s*,\s*(start|end|middle)\s*\)/.exec(spec);
	if (stepMatch) {
		return new StepTimingFunction(Number(stepMatch[1]), stepMatch[2]);
	}
	var bezierMatch =
			/cubic-bezier\(([^,]*),([^,]*),([^,]*),([^)]*)\)/.exec(spec);
	if (bezierMatch) {
		return new CubicBezierTimingFunction([
			Number(bezierMatch[1]),
			Number(bezierMatch[2]),
			Number(bezierMatch[3]),
			Number(bezierMatch[4])
		]);
	}
	return presetTimingFunctions.linear;
};



/** @constructor */
var CubicBezierTimingFunction = function(spec) {
	this.params = spec;
	this.map = [];
	for (var ii = 0; ii <= 100; ii += 1) {
		var i = ii / 100;
		this.map.push([
			3 * i * (1 - i) * (1 - i) * this.params[0] +
					3 * i * i * (1 - i) * this.params[2] + i * i * i,
			3 * i * (1 - i) * (1 - i) * this.params[1] +
					3 * i * i * (1 - i) * this.params[3] + i * i * i
		]);
	}
};

CubicBezierTimingFunction.prototype = createObject(TimingFunction.prototype, {
	scaleTime: function(fraction) {
		var fst = 0;
		while (fst !== 100 && fraction > this.map[fst][0]) {
			fst += 1;
		}
		if (fraction === this.map[fst][0] || fst === 0) {
			return this.map[fst][1];
		}
		var yDiff = this.map[fst][1] - this.map[fst - 1][1];
		var xDiff = this.map[fst][0] - this.map[fst - 1][0];
		var p = (fraction - this.map[fst - 1][0]) / xDiff;
		return this.map[fst - 1][1] + p * yDiff;
	}
});



/** @constructor */
var StepTimingFunction = function(numSteps, position) {
	this.numSteps = numSteps;
	this.position = position || 'end';
};

StepTimingFunction.prototype = createObject(TimingFunction.prototype, {
	scaleTime: function(fraction) {
		if (fraction >= 1) {
			return 1;
		}
		var stepSize = 1 / this.numSteps;
		if (this.position === 'start') {
			fraction += stepSize;
		} else if (this.position === 'middle') {
			fraction += stepSize / 2;
		}
		return fraction - fraction % stepSize;
	}
});

var CustomTimingFunction = function(method) {
	this.method = method;
}
CustomTimingFunction.prototype = createObject(TimingFunction.prototype, {
	scaleTime: function(progress) {
		return this.method.call(null,progress);
	}
});

var presetTimingFunctions = {
	'linear': null,
	'ease': new CubicBezierTimingFunction([0.25, 0.1, 0.25, 1.0]),
	'ease-in': new CubicBezierTimingFunction([0.42, 0, 1.0, 1.0]),
	'ease-out': new CubicBezierTimingFunction([0, 0, 0.58, 1.0]),
	'ease-in-out': new CubicBezierTimingFunction([0.42, 0, 0.58, 1.0]),
	'step-start': new StepTimingFunction(1, 'start'),
	'step-middle': new StepTimingFunction(1, 'middle'),
	'step-end': new StepTimingFunction(1, 'end')
};



/** @constructor */
var PacedTimingFunction = function(pathEffect) {
	ASSERT_ENABLED && assert(pathEffect instanceof HyperMotionPathEffect);
	this._pathEffect = pathEffect;
	// Range is the portion of the effect over which we pace, normalized to [0, 1].
	this._range = {min: 0, max: 1};
};

PacedTimingFunction.prototype = createObject(TimingFunction.prototype, {
	setRange: function(range) {
		ASSERT_ENABLED && assert(range.min >= 0 && range.min <= 1);
		ASSERT_ENABLED && assert(range.max >= 0 && range.max <= 1);
		ASSERT_ENABLED && assert(range.min < range.max);
		this._range = range;
	},
	scaleTime: function(fraction) {
		var cumulativeLengths = this._pathEffect._cumulativeLengths;
		var numSegments = cumulativeLengths.length - 1;
		if (!cumulativeLengths[numSegments] || fraction <= 0) {
			return this._range.min;
		}
		if (fraction >= 1) {
			return this._range.max;
		}
		var minLength = this.lengthAtIndex(this._range.min * numSegments);
		var maxLength = this.lengthAtIndex(this._range.max * numSegments);
		var length = interp(minLength, maxLength, fraction);
		var leftIndex = this.findLeftIndex(cumulativeLengths, length);
		var leftLength = cumulativeLengths[leftIndex];
		var segmentLength = cumulativeLengths[leftIndex + 1] - leftLength;
		if (segmentLength > 0) {
			return (leftIndex + (length - leftLength) / segmentLength) / numSegments;
		}
		return leftLength / cumulativeLengths.length;
	},
	findLeftIndex: function(array, value) {
		var leftIndex = 0;
		var rightIndex = array.length;
		while (rightIndex - leftIndex > 1) {
			var midIndex = (leftIndex + rightIndex) >> 1;
			if (array[midIndex] <= value) {
				leftIndex = midIndex;
			} else {
				rightIndex = midIndex;
			}
		}
		return leftIndex;
	},
	lengthAtIndex: function(i) {
		ASSERT_ENABLED && console.assert(i >= 0 && i <= cumulativeLengths.length - 1);
		var leftIndex = Math.floor(i);
		var startLength = this._pathEffect._cumulativeLengths[leftIndex];
		var endLength = this._pathEffect._cumulativeLengths[leftIndex + 1];
		var indexFraction = i % 1;
		return interp(startLength, endLength, indexFraction);
	}
});

var interp = function(from, to, f, type) {
	if (Array.isArray(from) || Array.isArray(to)) {
		return interpArray(from, to, f, type);
	}
	var zero = type === 'scale' ? 1.0 : 0.0;
	to = isDefinedAndNotNull(to) ? to : zero;
	from = isDefinedAndNotNull(from) ? from : zero;

	return to * f + from * (1 - f);
};

var interpArray = function(from, to, f, type) {
	ASSERT_ENABLED && assert(Array.isArray(from) || from === null, 'From is not an array or null');
	ASSERT_ENABLED && assert( Array.isArray(to) || to === null, 'To is not an array or null');
	ASSERT_ENABLED && assert( from === null || to === null || from.length === to.length, 'Arrays differ in length ' + from + ' : ' + to);
	var length = from ? from.length : to.length;
	var result = [];
	for (var i = 0; i < length; i++) {
		result[i] = interp(from ? from[i] : null, to ? to[i] : null, f, type);
	}
	return result;
};

var typeWithKeywords = function(keywords, type) {
	var isKeyword;
	if (keywords.length === 1) {
		var keyword = keywords[0];
		isKeyword = function(value) {
			return value === keyword;
		};
	} else {
		isKeyword = function(value) {
			return keywords.indexOf(value) >= 0;
		};
	}
	return createObject(type, {
		add: function(base, delta) {
			if (isKeyword(base) || isKeyword(delta)) {
				return delta;
			}
			return type.add(base, delta);
		},
		interpolate: function(from, to, f) {
			if (isKeyword(from) || isKeyword(to)) {
				return nonNumericType.interpolate(from, to, f);
			}
			return type.interpolate(from, to, f);
		},
		toCssValue: function(value, svgMode) {
			return isKeyword(value) ? value : type.toCssValue(value, svgMode);
		},
		fromCssValue: function(value) {
			return isKeyword(value) ? value : type.fromCssValue(value);
		}
	});
};



function INTERNAL_VALUE() {}
function InternalValue(property,typeObject,rawValue) { // TODO: implement this to replace rawValue which is either object, array, or number. Although, not so bad if you use the provided interface.
	this.typeObject = typeObject;
	this.rawValue = rawValue; // ugly private data that could be a number, an array, or an object TODO: change this
}
InternalValue.prototype = {
	
}

	

function OBJECT_TYPE() {} // KxDx experimental

var objectType = {
	toString: function() {
		return "objectType";
	},
	inverse: function(base) {
		if (!base) {
			console.log("objectType inverse must have base value to inverse");
			return {t:"object",d:{}};
		}
		var baseRawValueContainerObject = base.d;
		var result = {}
			var keys = Object.keys(baseRawValueContainerObject);
			keys.forEach(function(key) {
				var baseRawValueContainer = baseRawValueContainerObject[key];
				var baseTypeObject = baseRawValueContainer.o;
				var baseRawValue = baseRawValueContainer.v;
				var newRawValue = baseTypeObject.inverse(baseRawValue);
				result[key] = {o: baseTypeObject, v:newRawValue};
			});
			return {
				t : "object",
				d : result,
			}
	},
	zero: function(base) {
		if (!base) {
			console.log("objectType zero must have base value to zero");
			return {t:"object",d:{}};
		}
		var baseRawValueContainerObject = base.d;
		var result = {}
			var keys = Object.keys(baseRawValueContainerObject);
			keys.forEach(function(key) {
				var baseRawValueContainer = baseRawValueContainerObject[key];
				var baseTypeObject = baseRawValueContainer.o;
				var baseRawValue = baseRawValueContainer.v;
				var newRawValue = baseTypeObject.zero(baseRawValue);
				result[key] = {o: baseTypeObject, v:newRawValue};
			});
			return {
				t : "object",
				d : result,
			}
	},
	
	add: function(base,delta) { // add the sub values
		var baseRawValueContainerObject = base.d;
			var deltaRawValueContainerObject = delta.d;
			if (Object.keys(baseRawValueContainerObject).length != Object.keys(deltaRawValueContainerObject).length) { // TODO: insert zero values? Perhaps only insert fromRawValues.
				console.log("objectType add sub-property length must match.");
			}
			var result = {}
			var keys = Object.keys(deltaRawValueContainerObject);
			keys.forEach(function(key) { // again the problem is you need to getType from the rawValue not cssValue
				var baseRawValueContainer = baseRawValueContainerObject[key];
				var deltaRawValueContainer = deltaRawValueContainerObject[key];
				var baseTypeObject = baseRawValueContainer.o;
				var deltaTypeObject = deltaRawValueContainer.o;
				if (baseTypeObject !== deltaTypeObject) {
					console.log("objectType add sub-property types must match.");
				}
				var baseRawValue = baseRawValueContainer.v;
				var deltaRawValue = deltaRawValueContainer.v;
				
				var newRawValue = deltaTypeObject.add(baseRawValue,deltaRawValue);
				result[key] = {o: deltaTypeObject, v:newRawValue};
			});
			return {
				t : "object",
				d : result,
			}
	},
	
	subtract: function(base,delta) {
		return this.add(base,this.inverse(delta));
		},
		
		interpolate: function(from, to, f) {
			var fromRawValueContainerObject = from.d;
			var toRawValueContainerObject = to.d;
			if (Object.keys(fromRawValueContainerObject).length != Object.keys(toRawValueContainerObject).length) { // TODO: insert zero values? Perhaps only insert fromRawValues.
				console.log("objectType interpolate sub-property length must match.");
			}
			var result = {

			}
			var keys = Object.keys(toRawValueContainerObject);
			keys.forEach(function(key) {
				var fromRawValueContainer = fromRawValueContainerObject[key];
				var toRawValueContainer = toRawValueContainerObject[key];
				var fromTypeObject = fromRawValueContainer.o;
				var toTypeObject = toRawValueContainer.o;
				if (fromTypeObject !== toTypeObject) {
					console.log("objectType interpolate sub-property types must match.");
				}
				var fromRawValue = fromRawValueContainer.v;
				var toRawValue = toRawValueContainer.v;
				
				var newRawValue = toTypeObject.interpolate(fromRawValue,toRawValue,f);
				result[key] = {o: toTypeObject, v:newRawValue};
				
			});
			return {
				t : "object",
				d : result,
			}
		},
		
		toCssValue: function(base) { // This probably won't work if it's a number
			var rawValueContainerObject = base.d;
			var result = {};
			var keys = Object.keys(rawValueContainerObject);
			
			keys.forEach(function(key) {
				var rawValueContainer = rawValueContainerObject[key];
				var typeObject = rawValueContainer.o;
				var rawValue = rawValueContainer.v;
				var cssValue = typeObject.toCssValue(rawValue);
				result[key] = cssValue;
			});
			return result; // take "rawValue" and convert to anonymous object
		},
		
		fromCssValue: function(cssValue) { // cssValue is an anonymous object, not the rawValue description of it.
			var keys = Object.keys(cssValue);
			var result = {};
			keys.forEach(function(key) {
				var subValue = cssValue[key];
				var subTypeObject = getType(key,subValue);
				var rawValue = subTypeObject.fromCssValue(subValue);
				result[key] = {o: subTypeObject, v:rawValue };
			});
			return {
				t : "object",
				d : result
			}
		}

}







function ARRAY_TYPE() {}

var arrayType = {
	toString: function() {
		return "arrayType";
	},
	inverse: function(base) {
		return nonNumericType.inverse(base);
	},
	zero: function() {
		return {t:"array",d:[]};
		return [];
	},
	
	add: function(baseObject,deltaObject,sort) { // union // TODO: a sort function should be optional for animations
		
		var base = baseObject.d;
		var delta = deltaObject.d;
		var baseLength = base.length;
		var deltaLength = delta.length;
		if (sort) {
			var sortedBase = [];
			for (var i=0; i<baseLength; i++) {
				sortedBase.push(base[i]);
			}
			var sortedDelta = [];
			for (var i=0; i<deltaLength; i++) {
				sortedDelta.push(delta[i]);
			}
		}
		var result = base.slice(0);
	
		for (var i=0; i<deltaLength; i++) {
			var found = false;
			for (var j=0; j<baseLength; j++) {
				if (base[j] === delta[i]) {
					found = true;
					break;
				}
			}
			if (!found) {
				result.push(delta[i]);
			}
		}
		return {t:"array", d:result};
	},
	
	subtract: function(baseObject,deltaObject) {
		var base = baseObject;
		var delta = deltaObject;
		if (!isArray(base)) base = base.d;
		if (!isArray(delta)) delta = delta.d;
		
		var baseLength = base.length;
		var deltaLength = delta.length;
		var result = [];
		for (var i=0; i<baseLength; i++) {
			var found = false;
			for (var j=0; j<deltaLength; j++) {
				if (base[i] === delta[j]) {
					found = true;
					break;
				}
			}
			if (!found) result.push(base[i]);
		}
		return {t:"array", d:result};
		},
		interpolate: function(from, to, f) {
			var result = nonNumericType.interpolate(from, to);
			console.log("arrayType interpolate:%s; from:%s; to:%s; result:%s;",f,from,to,result);
		return result;
		},
		toCssValue: function(value) {
			//console.log("arrayType toCssValue:%s;",JSON.stringify(value));
			if (isArray(value)) {
				console.log("arrayType toCssValue:%s; SHOULD NOT BE AN ARRAY",value);
				return value;
			}
			return value.d.slice();
		},
		fromCssValue: function(value) {
			return {
				t : "array",
				d : value.slice(),
			}
		}

}

function NUMBER_TYPE() {}

var numberType = {
	toString: function() {
		return "numberType";
	},
	inverse: function(base) { 
		if (Number(base) != base) {
			console.log("numberType INVERSE not a number, base:%s;",base);
		}
		if (base === 'auto') {
			return nonNumericType.inverse(base);
		}
		var negative = base * -1;
		return negative;
	},
	zero : function() {
		return 0; 
	},
	add: function(base, delta) {
	
		if (Number(base) !== base && Number(delta) !== delta) {
			console.log("numberType ADD not a number, base:%s; delta:%s;",JSON.stringify(base),JSON.stringify(delta));
		} else if (Number(base) !== base) {
			console.log("numberType ADD not a number, base:%s;",JSON.stringify(base));
		} else if (Number(delta) !== delta) {
			console.log("numberType ADD not a number, delta:%s;",JSON.stringify(delta));
		}
		// If base or delta are 'auto', we fall back to replacement.
		if (base === 'auto' || delta === 'auto') {
			return nonNumericType.add(base, delta);
		}
		
		var result = base + delta;
		return result;
	},
	subtract: function(base,delta) { // KxDx
		
		var inverse = this.inverse(delta);
		if (Number(base) !== base) {
			console.log("numberType SUBTRACT not a number, base:%s;",base);
		}
		if (Number(delta) !== delta) {
			console.log("numberType SUBTRACT not a number, delta:%s;",delta);
		}
		if (Number(inverse) !== inverse) {
			console.log("numberType SUBTRACT not a number, inverse:%s;",inverse);
		}
		return this.add(base,this.inverse(delta));
	},
	interpolate: function(from, to, f) {
		// If from or to are 'auto', we fall back to step interpolation.
		if (from === 'auto' || to === 'auto') {
			return nonNumericType.interpolate(from, to);
		}
		return interp(from, to, f);
	},
	//toCssValue: function(value) { return value + ''; }, // original
	toCssValue: function(value) { return value; }, // no strings damn it. Unknown side effects
	fromCssValue: function(value) {
		if (value === 'auto') {
			return 'auto';
		}
		var result = Number(value);
		return isNaN(result) ? undefined : result;
	}
};

var integerType = createObject(numberType, {
	interpolate: function(from, to, f) {
		// If from or to are 'auto', we fall back to step interpolation.
		if (from === 'auto' || to === 'auto') {
			return nonNumericType.interpolate(from, to);
		}
		return Math.floor(interp(from, to, f));
	}
});

var fontWeightType = {
	toString: function() {
		return "fontWeightType";
	},
	inverse: function(value) { // KxDx
		return value * -1;
	},
	add: function(base, delta) { return base + delta; },
	subtract: function(base,delta) { // KxDx
		return this.add(base,this.inverse(delta));
	},
	interpolate: function(from, to, f) {
		return interp(from, to, f);
	},
	toCssValue: function(value) {
		value = Math.round(value / 100) * 100;
		value = clamp(value, 100, 900);
		if (value === 400) {
			return 'normal';
		}
		if (value === 700) {
			return 'bold';
		}
		return String(value);
	},
	fromCssValue: function(value) {
		// TODO: support lighter / darker ?
		var out = Number(value);
		if (isNaN(out) || out < 100 || out > 900 || out % 100 !== 0) {
			return undefined;
		}
		return out;
	}
};

// This regular expression is intentionally permissive, so that
// platform-prefixed versions of calc will still be accepted as
// input. While we are restrictive with the transform property
// name, we need to be able to read underlying calc values from
// computedStyle so can't easily restrict the input here.
var outerCalcRE = /^\s*(-webkit-)?calc\s*\(\s*([^)]*)\)/;
var valueRE = /^\s*(-?[0-9]+(\.[0-9])?[0-9]*)([a-zA-Z%]*)/;
var operatorRE = /^\s*([+-])/;
var autoRE = /^\s*auto/i;

function PERCENT_LENGTH_TYPE() {}

var percentLengthType = {
	toString: function() {
		return "percentLengthType";
	},
	zero: function() { 
		return {px : 0}; 
	},
	add: function(base, delta) {
		if (delta === null || delta === undefined) {
			delta = {}; // bug fix / hack. transformType does this too. So should the rest. If element is removed from dom, CompositedPropertyMap can't applyAnimatedValues when additive. Lack of a transform also has this problem
		}
		if (base === null || base === undefined) {
			base = {}; // bug fix / hack. transformType does this too. So should the rest. If element is removed from dom, CompositedPropertyMap can't applyAnimatedValues when additive. Lack of a transform also has this problem
		}
		var out = {};
		for (var value in base) {
			//console.log("value:%s;",value);
			out[value] = base[value] + (delta[value] || 0);
		}
		for (value in delta) {
			if (value in base) {
				continue;
			}
			out[value] = delta[value];
		}
		return out;
	},
	subtract: function(base,delta) {
		var inverse = this.inverse(delta);
		var sum = this.add(base,inverse);
		return sum;
	},
	interpolate: function(from, to, f) {
		var out = {};
		for (var value in from) {
			out[value] = interp(from[value], to[value], f);
		}
		for (var value in to) {
			if (value in out) {
				continue;
			}
			out[value] = interp(0, to[value], f);
		}
		return out;
	},
	toCssValue: function(value) {
		var s = '';
		var singleValue = true;
		for (var item in value) {
			if (s === '') {
				s = value[item] + item;
			} else if (singleValue) {
				if (value[item] !== 0) {
					s = features.calcFunction +
							'(' + s + ' + ' + value[item] + item + ')';
					singleValue = false;
				}
			} else if (value[item] !== 0) {
				s = s.substring(0, s.length - 1) + ' + ' + value[item] + item + ')';
			}
		}
		return s;
	},
	fromCssValue: function(value) {
		var result = percentLengthType.consumeValueFromString(value);
		if (result) {
			return result.value;
		}
		return undefined;
	},
	consumeValueFromString: function(value) {
		if (!isDefinedAndNotNull(value)) {
			return undefined;
		}
		var autoMatch = autoRE.exec(value);
		if (autoMatch) {
			return {
				value: { auto: true },
				remaining: value.substring(autoMatch[0].length)
			};
		}
		var out = {};
		var calcMatch = outerCalcRE.exec(value);
		if (!calcMatch) {
			var singleValue = valueRE.exec(value);
			if (singleValue && (singleValue.length === 4)) {
				out[singleValue[3]] = Number(singleValue[1]);
				return {
					value: out,
					remaining: value.substring(singleValue[0].length)
				};
			}
			return undefined;
		}
		var remaining = value.substring(calcMatch[0].length);
		var calcInnards = calcMatch[2];
		var firstTime = true;
		while (true) {
			var reversed = false;
			if (firstTime) {
				firstTime = false;
			} else {
				var op = operatorRE.exec(calcInnards);
				if (!op) {
					return undefined;
				}
				if (op[1] === '-') {
					reversed = true;
				}
				calcInnards = calcInnards.substring(op[0].length);
			}
			value = valueRE.exec(calcInnards);
			if (!value) {
				return undefined;
			}
			var valueUnit = value[3];
			var valueNumber = Number(value[1]);
			if (!isDefinedAndNotNull(out[valueUnit])) {
				out[valueUnit] = 0;
			}
			if (reversed) {
				out[valueUnit] -= valueNumber;
			} else {
				out[valueUnit] += valueNumber;
			}
			calcInnards = calcInnards.substring(value[0].length);
			if (/\s*/.exec(calcInnards)[0].length === calcInnards.length) {
				return {
					value: out,
					remaining: remaining
				};
			}
		}
	},
	inverse: function(value) {
		var out = {};
		for (var unit in value) {
			out[unit] = -value[unit];
		}
		return out;
	}
};

var percentLengthAutoType = typeWithKeywords(['auto'], percentLengthType);

var positionKeywordRE = /^\s*left|^\s*center|^\s*right|^\s*top|^\s*bottom/i;
var positionType = {
	toString: function() {
		return "positionType";
	},
	inverse: function(base) { // KxDx
		return [
			percentLengthType.inverse(base[0]),
			percentLengthType.add(base[1])
		];
	},
	zero: function() { return [{ px: 0 }, { px: 0 }]; },
	add: function(base, delta) {
		return [
			percentLengthType.add(base[0], delta[0]),
			percentLengthType.add(base[1], delta[1])
		];
	},
	subtract: function(base,delta) { // KxDx
		return this.add(base,this.inverse(delta));
	},
	interpolate: function(from, to, f) {
		return [
			percentLengthType.interpolate(from[0], to[0], f),
			percentLengthType.interpolate(from[1], to[1], f)
		];
	},
	toCssValue: function(value) {
		return value.map(percentLengthType.toCssValue).join(' ');
	},
	fromCssValue: function(value) {
		var tokens = [];
		var remaining = value;
		while (true) {
			var result = positionType.consumeTokenFromString(remaining);
			if (!result) {
				return undefined;
			}
			tokens.push(result.value);
			remaining = result.remaining;
			if (!result.remaining.trim()) {
				break;
			}
			if (tokens.length >= 4) {
				return undefined;
			}
		}

		if (tokens.length === 1) {
			var token = tokens[0];
			return (positionType.isHorizontalToken(token) ?
					[token, 'center'] : ['center', token]).map(positionType.resolveToken);
		}

		if (tokens.length === 2 &&
				positionType.isHorizontalToken(tokens[0]) &&
				positionType.isVerticalToken(tokens[1])) {
			return tokens.map(positionType.resolveToken);
		}

		if (tokens.filter(positionType.isKeyword).length !== 2) {
			return undefined;
		}

		var out = [undefined, undefined];
		var center = false;
		for (var i = 0; i < tokens.length; i++) {
			var token = tokens[i];
			if (!positionType.isKeyword(token)) {
				return undefined;
			}
			if (token === 'center') {
				if (center) {
					return undefined;
				}
				center = true;
				continue;
			}
			var axis = Number(positionType.isVerticalToken(token));
			if (out[axis]) {
				return undefined;
			}
			if (i === tokens.length - 1 || positionType.isKeyword(tokens[i + 1])) {
				out[axis] = positionType.resolveToken(token);
				continue;
			}
			var percentLength = tokens[++i];
			if (token === 'bottom' || token === 'right') {
				percentLength = percentLengthType.inverse(percentLength);
				percentLength['%'] = (percentLength['%'] || 0) + 100;
			}
			out[axis] = percentLength;
		}
		if (center) {
			if (!out[0]) {
				out[0] = positionType.resolveToken('center');
			} else if (!out[1]) {
				out[1] = positionType.resolveToken('center');
			} else {
				return undefined;
			}
		}
		return out.every(isDefinedAndNotNull) ? out : undefined;
	},
	consumeTokenFromString: function(value) {
		var keywordMatch = positionKeywordRE.exec(value);
		if (keywordMatch) {
			return {
				value: keywordMatch[0].trim().toLowerCase(),
				remaining: value.substring(keywordMatch[0].length)
			};
		}
		return percentLengthType.consumeValueFromString(value);
	},
	resolveToken: function(token) {
		if (typeof token === 'string') {
			return percentLengthType.fromCssValue({
				left: '0%',
				center: '50%',
				right: '100%',
				top: '0%',
				bottom: '100%'
			}[token]);
		}
		return token;
	},
	isHorizontalToken: function(token) {
		if (typeof token === 'string') {
			return token in { left: true, center: true, right: true };
		}
		return true;
	},
	isVerticalToken: function(token) {
		if (typeof token === 'string') {
			return token in { top: true, center: true, bottom: true };
		}
		return true;
	},
	isKeyword: function(token) {
		return typeof token === 'string';
	}
};

// Spec: http://dev.w3.org/csswg/css-backgrounds/#background-position
var positionListType = {
	toString: function() {
		return "positionListType";
	},
	inverse: function(base) { // KxDx
		var out = [];
		var maxLength = base.length;
		for (var i = 0; i < maxLength; i++) {
			var basePosition = base[i] ? base[i] : positionType.zero();
			out.push(positionType.inverse(basePosition));
		}
		return out;
	},
	zero: function() { return [positionType.zero()]; },
	add: function(base, delta) {
		var out = [];
		var maxLength = Math.max(base.length, delta.length);
		for (var i = 0; i < maxLength; i++) {
			var basePosition = base[i] ? base[i] : positionType.zero();
			var deltaPosition = delta[i] ? delta[i] : positionType.zero();
			out.push(positionType.add(basePosition, deltaPosition));
		}
		return out;
	},
	subtract: function(base,delta) { // KxDx
		return this.add(base,this.inverse(delta));
	},
	interpolate: function(from, to, f) {
		var out = [];
		var maxLength = Math.max(from.length, to.length);
		for (var i = 0; i < maxLength; i++) {
			var fromPosition = from[i] ? from[i] : positionType.zero();
			var toPosition = to[i] ? to[i] : positionType.zero();
			out.push(positionType.interpolate(fromPosition, toPosition, f));
		}
		return out;
	},
	toCssValue: function(value) {
		return value.map(positionType.toCssValue).join(', ');
	},
	fromCssValue: function(value) {
		if (!isDefinedAndNotNull(value)) {
			return undefined;
		}
		if (!value.trim()) {
			return [positionType.fromCssValue('0% 0%')];
		}
		var positionValues = value.split(',');
		var out = positionValues.map(positionType.fromCssValue);
		return out.every(isDefinedAndNotNull) ? out : undefined;
	}
};

var rectangleRE = /rect\(([^,]+),([^,]+),([^,]+),([^)]+)\)/;
var rectangleType = {
	toString: function() {
		return "rectangleType";
	},
	inverse: function(value) { // KxDx
		return {
			top: percentLengthType.inverse(value.top),
			right: percentLengthType.inverse(value.right),
			bottom: percentLengthType.inverse(value.bottom),
			left: percentLengthType.inverse(value.left)
		}
	},
	zero: function() { return {top:0, right:0, bottom:0, left:0};},// KxDx
	add: function(base, delta) {
		return {
			top: percentLengthType.add(base.top, delta.top),
			right: percentLengthType.add(base.right, delta.right),
			bottom: percentLengthType.add(base.bottom, delta.bottom),
			left: percentLengthType.add(base.left, delta.left)
		};
	},
	subtract: function(base,delta) { // KxDx
		return this.add(base,this.inverse(delta));
	},
	interpolate: function(from, to, f) {
		return {
			top: percentLengthType.interpolate(from.top, to.top, f),
			right: percentLengthType.interpolate(from.right, to.right, f),
			bottom: percentLengthType.interpolate(from.bottom, to.bottom, f),
			left: percentLengthType.interpolate(from.left, to.left, f)
		};
	},
	toCssValue: function(value) {
		return 'rect(' +
				percentLengthType.toCssValue(value.top) + ',' +
				percentLengthType.toCssValue(value.right) + ',' +
				percentLengthType.toCssValue(value.bottom) + ',' +
				percentLengthType.toCssValue(value.left) + ')';
	},
	fromCssValue: function(value) {
		var match = rectangleRE.exec(value);
		if (!match) {
			return undefined;
		}
		var out = {
			top: percentLengthType.fromCssValue(match[1]),
			right: percentLengthType.fromCssValue(match[2]),
			bottom: percentLengthType.fromCssValue(match[3]),
			left: percentLengthType.fromCssValue(match[4])
		};
		if (out.top && out.right && out.bottom && out.left) {
			return out;
		}
		return undefined;
	}
};

var shadowType = {
	toString: function() {
		return "shadowType";
	},
	inverse: function(value) {
		return nonNumericType.inverse(value);
	},
	zero: function() {
		return {
			hOffset: lengthType.zero(),
			vOffset: lengthType.zero()
		};
	},
	_addSingle: function(base, delta) {
		if (base && delta && base.inset !== delta.inset) {
			return delta;
		}
		var result = {
			inset: base ? base.inset : delta.inset,
			hOffset: lengthType.add(
					base ? base.hOffset : lengthType.zero(),
					delta ? delta.hOffset : lengthType.zero()),
			vOffset: lengthType.add(
					base ? base.vOffset : lengthType.zero(),
					delta ? delta.vOffset : lengthType.zero()),
			blur: lengthType.add(
					base && base.blur || lengthType.zero(),
					delta && delta.blur || lengthType.zero())
		};
		if (base && base.spread || delta && delta.spread) {
			result.spread = lengthType.add(
					base && base.spread || lengthType.zero(),
					delta && delta.spread || lengthType.zero());
		}
		if (base && base.color || delta && delta.color) {
			result.color = colorType.add(
					base && base.color || colorType.zero(),
					delta && delta.color || colorType.zero());
		}
		return result;
	},
	add: function(base, delta) {
		var result = [];
		for (var i = 0; i < base.length || i < delta.length; i++) {
			result.push(this._addSingle(base[i], delta[i]));
		}
		return result;
	},
	subtract: function(base,delta) { // KxDx
		return this.add(base,this.inverse(delta));
	},
	_interpolateSingle: function(from, to, f) {
		if (from && to && from.inset !== to.inset) {
			return f < 0.5 ? from : to;
		}
		var result = {
			inset: from ? from.inset : to.inset,
			hOffset: lengthType.interpolate(
					from ? from.hOffset : lengthType.zero(),
					to ? to.hOffset : lengthType.zero(), f),
			vOffset: lengthType.interpolate(
					from ? from.vOffset : lengthType.zero(),
					to ? to.vOffset : lengthType.zero(), f),
			blur: lengthType.interpolate(
					from && from.blur || lengthType.zero(),
					to && to.blur || lengthType.zero(), f)
		};
		if (from && from.spread || to && to.spread) {
			result.spread = lengthType.interpolate(
					from && from.spread || lengthType.zero(),
					to && to.spread || lengthType.zero(), f);
		}
		if (from && from.color || to && to.color) {
			result.color = colorType.interpolate(
					from && from.color || colorType.zero(),
					to && to.color || colorType.zero(), f);
		}
		return result;
	},
	interpolate: function(from, to, f) {
		var result = [];
		for (var i = 0; i < from.length || i < to.length; i++) {
			result.push(this._interpolateSingle(from[i], to[i], f));
		}
		return result;
	},
	_toCssValueSingle: function(value) {
		return (value.inset ? 'inset ' : '') +
				lengthType.toCssValue(value.hOffset) + ' ' +
				lengthType.toCssValue(value.vOffset) + ' ' +
				lengthType.toCssValue(value.blur) +
				(value.spread ? ' ' + lengthType.toCssValue(value.spread) : '') +
				(value.color ? ' ' + colorType.toCssValue(value.color) : '');
	},
	toCssValue: function(value) {
		return value.map(this._toCssValueSingle).join(', ');
	},
	fromCssValue: function(value) {
		var shadowRE = /(([^(,]+(\([^)]*\))?)+)/g;
		var match;
		var shadows = [];
		while ((match = shadowRE.exec(value)) !== null) {
			shadows.push(match[0]);
		}

		var result = shadows.map(function(value) {
			if (value === 'none') {
				return shadowType.zero();
			}
			value = value.replace(/^\s+|\s+$/g, '');

			var partsRE = /([^ (]+(\([^)]*\))?)/g;
			var parts = [];
			while ((match = partsRE.exec(value)) !== null) {
				parts.push(match[0]);
			}

			if (parts.length < 2 || parts.length > 7) {
				return undefined;
			}
			var result = {
				inset: false
			};

			var lengths = [];
			while (parts.length) {
				var part = parts.shift();

				var length = lengthType.fromCssValue(part);
				if (length) {
					lengths.push(length);
					continue;
				}

				var color = colorType.fromCssValue(part);
				if (color) {
					result.color = color;
				}

				if (part === 'inset') {
					result.inset = true;
				}
			}

			if (lengths.length < 2 || lengths.length > 4) {
				return undefined;
			}
			result.hOffset = lengths[0];
			result.vOffset = lengths[1];
			if (lengths.length > 2) {
				result.blur = lengths[2];
			}
			if (lengths.length > 3) {
				result.spread = lengths[3];
			}
			return result;
		});

		return result.every(isDefined) ? result : undefined;
	}
};

var nonNumericType = {
toString: function() {
		return "nonNumericType";
	},
	zero: function() {
		return "";
	},
	inverse: function(value) {
		return value;
	},
	add: function(base, delta) {
		return isDefined(delta) ? delta : base;
	},
	subtract: function(base,delta) { // KxDx
		return this.add(base,this.inverse(delta));
	},
	interpolate: function(from, to, f) {
		return f < 0.5 ? from : to;
	},
	toCssValue: function(value) {
		return value;
	},
	fromCssValue: function(value) {
		return value;
	}
};

function VISIBILITY_TYPE() {}

var visibilityType = createObject(nonNumericType, {
	toString: function() {
		return "visibilityType";
	},
	interpolate: function(from, to, f) {
		if (from !== 'visible' && to !== 'visible') {
			return nonNumericType.interpolate(from, to, f);
		}
		if (f <= 0) {
			return from;
		}
		if (f >= 1) {
			return to;
		}
		return 'visible';
	},
	fromCssValue: function(value) {
		if (['visible', 'hidden', 'collapse'].indexOf(value) !== -1) {
			return value;
		}
		return undefined;
	}
});

function LENGTH_TYPE() {}

var lengthType = percentLengthType;
var lengthAutoType = typeWithKeywords(['auto'], lengthType);

var colorRE = new RegExp(
		'(hsla?|rgba?)\\(' +
		'([\\-0-9]+%?),?\\s*' +
		'([\\-0-9]+%?),?\\s*' +
		'([\\-0-9]+%?)(?:,?\\s*([\\-0-9\\.]+%?))?' +
		'\\)');
var colorHashRE = new RegExp(
		'#([0-9A-Fa-f][0-9A-Fa-f]?)' +
		'([0-9A-Fa-f][0-9A-Fa-f]?)' +
		'([0-9A-Fa-f][0-9A-Fa-f]?)');

function hsl2rgb(h, s, l) {
	// Cribbed from http://dev.w3.org/csswg/css-color/#hsl-color
	// Wrap to 0->360 degrees (IE -10 === 350) then normalize
	h = (((h % 360) + 360) % 360) / 360;
	s = s / 100;
	l = l / 100;
	function hue2rgb(m1, m2, h) {
		if (h < 0) {
			h += 1;
		}
		if (h > 1) {
			h -= 1;
		}
		if (h * 6 < 1) {
			return m1 + (m2 - m1) * h * 6;
		}
		if (h * 2 < 1) {
			return m2;
		}
		if (h * 3 < 2) {
			return m1 + (m2 - m1) * (2 / 3 - h) * 6;
		}
		return m1;
	}
	var m2;
	if (l <= 0.5) {
		m2 = l * (s + 1);
	} else {
		m2 = l + s - l * s;
	}

	var m1 = l * 2 - m2;
	var r = Math.ceil(hue2rgb(m1, m2, h + 1 / 3) * 255);
	var g = Math.ceil(hue2rgb(m1, m2, h) * 255);
	var b = Math.ceil(hue2rgb(m1, m2, h - 1 / 3) * 255);
	return [r, g, b];
}

var namedColors = {
	aliceblue: [240, 248, 255, 1],
	antiquewhite: [250, 235, 215, 1],
	aqua: [0, 255, 255, 1],
	aquamarine: [127, 255, 212, 1],
	azure: [240, 255, 255, 1],
	beige: [245, 245, 220, 1],
	bisque: [255, 228, 196, 1],
	black: [0, 0, 0, 1],
	blanchedalmond: [255, 235, 205, 1],
	blue: [0, 0, 255, 1],
	blueviolet: [138, 43, 226, 1],
	brown: [165, 42, 42, 1],
	burlywood: [222, 184, 135, 1],
	cadetblue: [95, 158, 160, 1],
	chartreuse: [127, 255, 0, 1],
	chocolate: [210, 105, 30, 1],
	coral: [255, 127, 80, 1],
	cornflowerblue: [100, 149, 237, 1],
	cornsilk: [255, 248, 220, 1],
	crimson: [220, 20, 60, 1],
	cyan: [0, 255, 255, 1],
	darkblue: [0, 0, 139, 1],
	darkcyan: [0, 139, 139, 1],
	darkgoldenrod: [184, 134, 11, 1],
	darkgray: [169, 169, 169, 1],
	darkgreen: [0, 100, 0, 1],
	darkgrey: [169, 169, 169, 1],
	darkkhaki: [189, 183, 107, 1],
	darkmagenta: [139, 0, 139, 1],
	darkolivegreen: [85, 107, 47, 1],
	darkorange: [255, 140, 0, 1],
	darkorchid: [153, 50, 204, 1],
	darkred: [139, 0, 0, 1],
	darksalmon: [233, 150, 122, 1],
	darkseagreen: [143, 188, 143, 1],
	darkslateblue: [72, 61, 139, 1],
	darkslategray: [47, 79, 79, 1],
	darkslategrey: [47, 79, 79, 1],
	darkturquoise: [0, 206, 209, 1],
	darkviolet: [148, 0, 211, 1],
	deeppink: [255, 20, 147, 1],
	deepskyblue: [0, 191, 255, 1],
	dimgray: [105, 105, 105, 1],
	dimgrey: [105, 105, 105, 1],
	dodgerblue: [30, 144, 255, 1],
	firebrick: [178, 34, 34, 1],
	floralwhite: [255, 250, 240, 1],
	forestgreen: [34, 139, 34, 1],
	fuchsia: [255, 0, 255, 1],
	gainsboro: [220, 220, 220, 1],
	ghostwhite: [248, 248, 255, 1],
	gold: [255, 215, 0, 1],
	goldenrod: [218, 165, 32, 1],
	gray: [128, 128, 128, 1],
	green: [0, 128, 0, 1],
	greenyellow: [173, 255, 47, 1],
	grey: [128, 128, 128, 1],
	honeydew: [240, 255, 240, 1],
	hotpink: [255, 105, 180, 1],
	indianred: [205, 92, 92, 1],
	indigo: [75, 0, 130, 1],
	ivory: [255, 255, 240, 1],
	khaki: [240, 230, 140, 1],
	lavender: [230, 230, 250, 1],
	lavenderblush: [255, 240, 245, 1],
	lawngreen: [124, 252, 0, 1],
	lemonchiffon: [255, 250, 205, 1],
	lightblue: [173, 216, 230, 1],
	lightcoral: [240, 128, 128, 1],
	lightcyan: [224, 255, 255, 1],
	lightgoldenrodyellow: [250, 250, 210, 1],
	lightgray: [211, 211, 211, 1],
	lightgreen: [144, 238, 144, 1],
	lightgrey: [211, 211, 211, 1],
	lightpink: [255, 182, 193, 1],
	lightsalmon: [255, 160, 122, 1],
	lightseagreen: [32, 178, 170, 1],
	lightskyblue: [135, 206, 250, 1],
	lightslategray: [119, 136, 153, 1],
	lightslategrey: [119, 136, 153, 1],
	lightsteelblue: [176, 196, 222, 1],
	lightyellow: [255, 255, 224, 1],
	lime: [0, 255, 0, 1],
	limegreen: [50, 205, 50, 1],
	linen: [250, 240, 230, 1],
	magenta: [255, 0, 255, 1],
	maroon: [128, 0, 0, 1],
	mediumaquamarine: [102, 205, 170, 1],
	mediumblue: [0, 0, 205, 1],
	mediumorchid: [186, 85, 211, 1],
	mediumpurple: [147, 112, 219, 1],
	mediumseagreen: [60, 179, 113, 1],
	mediumslateblue: [123, 104, 238, 1],
	mediumspringgreen: [0, 250, 154, 1],
	mediumturquoise: [72, 209, 204, 1],
	mediumvioletred: [199, 21, 133, 1],
	midnightblue: [25, 25, 112, 1],
	mintcream: [245, 255, 250, 1],
	mistyrose: [255, 228, 225, 1],
	moccasin: [255, 228, 181, 1],
	navajowhite: [255, 222, 173, 1],
	navy: [0, 0, 128, 1],
	oldlace: [253, 245, 230, 1],
	olive: [128, 128, 0, 1],
	olivedrab: [107, 142, 35, 1],
	orange: [255, 165, 0, 1],
	orangered: [255, 69, 0, 1],
	orchid: [218, 112, 214, 1],
	palegoldenrod: [238, 232, 170, 1],
	palegreen: [152, 251, 152, 1],
	paleturquoise: [175, 238, 238, 1],
	palevioletred: [219, 112, 147, 1],
	papayawhip: [255, 239, 213, 1],
	peachpuff: [255, 218, 185, 1],
	peru: [205, 133, 63, 1],
	pink: [255, 192, 203, 1],
	plum: [221, 160, 221, 1],
	powderblue: [176, 224, 230, 1],
	purple: [128, 0, 128, 1],
	red: [255, 0, 0, 1],
	rosybrown: [188, 143, 143, 1],
	royalblue: [65, 105, 225, 1],
	saddlebrown: [139, 69, 19, 1],
	salmon: [250, 128, 114, 1],
	sandybrown: [244, 164, 96, 1],
	seagreen: [46, 139, 87, 1],
	seashell: [255, 245, 238, 1],
	sienna: [160, 82, 45, 1],
	silver: [192, 192, 192, 1],
	skyblue: [135, 206, 235, 1],
	slateblue: [106, 90, 205, 1],
	slategray: [112, 128, 144, 1],
	slategrey: [112, 128, 144, 1],
	snow: [255, 250, 250, 1],
	springgreen: [0, 255, 127, 1],
	steelblue: [70, 130, 180, 1],
	tan: [210, 180, 140, 1],
	teal: [0, 128, 128, 1],
	thistle: [216, 191, 216, 1],
	tomato: [255, 99, 71, 1],
	transparent: [0, 0, 0, 0],
	turquoise: [64, 224, 208, 1],
	violet: [238, 130, 238, 1],
	wheat: [245, 222, 179, 1],
	white: [255, 255, 255, 1],
	whitesmoke: [245, 245, 245, 1],
	yellow: [255, 255, 0, 1],
	yellowgreen: [154, 205, 50, 1]
};

function COLOR_TYPE() {}

var colorType = typeWithKeywords(['currentColor'], {
	inverse: function(value) { // KxDx
		return nonNumericType.inverse(value); // this can't be right
	},
	zero: function() { return [0, 0, 0, 0]; },
	_premultiply: function(value) {
		var alpha = value[3];
		return [value[0] * alpha, value[1] * alpha, value[2] * alpha];
	},
	add: function(base, delta) {
		var alpha = Math.min(base[3] + delta[3], 1);
		if (alpha === 0) {
			return [0, 0, 0, 0];
		}
		base = this._premultiply(base);
		delta = this._premultiply(delta);
		return [(base[0] + delta[0]) / alpha, (base[1] + delta[1]) / alpha,
						(base[2] + delta[2]) / alpha, alpha];
	},
	subtract: function(base,delta) { // KxDx
		return this.add(base,this.inverse(delta));
	},
	interpolate: function(from, to, f) {
		var alpha = clamp(interp(from[3], to[3], f), 0, 1);
		if (alpha === 0) {
			return [0, 0, 0, 0];
		}
		from = this._premultiply(from);
		to = this._premultiply(to);
		return [interp(from[0], to[0], f) / alpha,
						interp(from[1], to[1], f) / alpha,
						interp(from[2], to[2], f) / alpha, alpha];
	},
	toCssValue: function(value) {
		return 'rgba(' + Math.round(value[0]) + ', ' + Math.round(value[1]) +
				', ' + Math.round(value[2]) + ', ' + value[3] + ')';
	},
	fromCssValue: function(value) {
		// http://dev.w3.org/csswg/css-color/#color
		var out = [];

		var regexResult = colorHashRE.exec(value);
		if (regexResult) {
			if (value.length !== 4 && value.length !== 7) {
				return undefined;
			}

			var out = [];
			regexResult.shift();
			for (var i = 0; i < 3; i++) {
				if (regexResult[i].length === 1) {
					regexResult[i] = regexResult[i] + regexResult[i];
				}
				var v = Math.max(Math.min(parseInt(regexResult[i], 16), 255), 0);
				out[i] = v;
			}
			out.push(1.0);
		}

		var regexResult = colorRE.exec(value);
		if (regexResult) {
			regexResult.shift();
			var type = regexResult.shift().substr(0, 3);
			for (var i = 0; i < 3; i++) {
				var m = 1;
				if (regexResult[i][regexResult[i].length - 1] === '%') {
					regexResult[i] = regexResult[i].substr(0, regexResult[i].length - 1);
					m = 255.0 / 100.0;
				}
				if (type === 'rgb') {
					out[i] = clamp(Math.round(parseInt(regexResult[i], 10) * m), 0, 255);
				} else {
					out[i] = parseInt(regexResult[i], 10);
				}
			}

			// Convert hsl values to rgb value
			if (type === 'hsl') {
				out = hsl2rgb.apply(null, out);
			}

			if (typeof regexResult[3] !== 'undefined') {
				out[3] = Math.max(Math.min(parseFloat(regexResult[3]), 1.0), 0.0);
			} else {
				out.push(1.0);
			}
		}

		if (out.some(isNaN)) {
			return undefined;
		}
		if (out.length > 0) {
			return out;
		}
		return namedColors[value];
	}
});

var convertToDeg = function(num, type) {
	switch (type) {
		case 'grad':
			return num / 400 * 360;
		case 'rad':
			return num / 2 / Math.PI * 360;
		case 'turn':
			return num * 360;
		default:
			return num;
	}
};

var extractValue = function(values, pos, hasUnits) {
	var value = Number(values[pos]);
	if (!hasUnits) {
		return value;
	}
	var type = values[pos + 1];
	if (type === '') { type = 'px'; }
	var result = {};
	result[type] = value;
	return result;
};

var extractValues = function(values, numValues, hasOptionalValue,
		hasUnits) {
	var result = [];
	for (var i = 0; i < numValues; i++) {
		result.push(extractValue(values, 1 + 2 * i, hasUnits));
	}
	if (hasOptionalValue && values[1 + 2 * numValues]) {
		result.push(extractValue(values, 1 + 2 * numValues, hasUnits));
	}
	return result;
};

var SPACES = '\\s*';
var NUMBER = '[+-]?(?:\\d+|\\d*\\.\\d+)';
var RAW_OPEN_BRACKET = '\\(';
var RAW_CLOSE_BRACKET = '\\)';
var RAW_COMMA = ',';
var UNIT = '[a-zA-Z%]*';
var START = '^';

function capture(x) { return '(' + x + ')'; }
function optional(x) { return '(?:' + x + ')?'; }

var OPEN_BRACKET = [SPACES, RAW_OPEN_BRACKET, SPACES].join('');
var CLOSE_BRACKET = [SPACES, RAW_CLOSE_BRACKET, SPACES].join('');
var COMMA = [SPACES, RAW_COMMA, SPACES].join('');
var UNIT_NUMBER = [capture(NUMBER), capture(UNIT)].join('');

function transformRE(name, numParms, hasOptionalParm) {
	var tokenList = [START, SPACES, name, OPEN_BRACKET];
	for (var i = 0; i < numParms - 1; i++) {
		tokenList.push(UNIT_NUMBER);
		tokenList.push(COMMA);
	}
	tokenList.push(UNIT_NUMBER);
	if (hasOptionalParm) {
		tokenList.push(optional([COMMA, UNIT_NUMBER].join('')));
	}
	tokenList.push(CLOSE_BRACKET);
	return new RegExp(tokenList.join(''));
}

function buildMatcher(name, numValues, hasOptionalValue, hasUnits, baseValue) {
	var baseName = name;
	if (baseValue) {
		if (name[name.length - 1] === 'X' || name[name.length - 1] === 'Y') {
			baseName = name.substring(0, name.length - 1);
		} else if (name[name.length - 1] === 'Z') {
			baseName = name.substring(0, name.length - 1) + '3d';
		}
	}

	var f = function(x) {
		var r = extractValues(x, numValues, hasOptionalValue, hasUnits);
		if (baseValue !== undefined) {
			if (name[name.length - 1] === 'X') {
				r.push(baseValue);
			} else if (name[name.length - 1] === 'Y') {
				r = [baseValue].concat(r);
			} else if (name[name.length - 1] === 'Z') {
				r = [baseValue, baseValue].concat(r);
			} else if (hasOptionalValue) {
				while (r.length < 2) {
					if (baseValue === 'copy') {
						r.push(r[0]);
					} else {
						r.push(baseValue);
					}
				}
			}
		}
		return r;
	};
	return [transformRE(name, numValues, hasOptionalValue), f, baseName];
}

function buildRotationMatcher(name, numValues, hasOptionalValue, baseValue) {
	var m = buildMatcher(name, numValues, hasOptionalValue, true, baseValue);
	var f = function(x) {
			var r = m[1](x);
			return r.map(function(v) {
			var result = 0;
			for (var type in v) {
				result += convertToDeg(v[type], type);
			}
			return result;
		});	
	};
		return [m[0], f, m[2]];
}

function build3DRotationMatcher() {
	var m = buildMatcher('rotate3d', 4, false, true);
	var f = function(x) {
		var r = m[1](x);
		var out = [];
		for (var i = 0; i < 3; i++) {
			out.push(r[i].px);
		}
		out.push(r[3]);
		return out;
	};
	return [m[0], f, m[2]];
}

var transformREs = [
	buildRotationMatcher('rotate', 1, false),
	buildRotationMatcher('rotateX', 1, false),
	buildRotationMatcher('rotateY', 1, false),
	buildRotationMatcher('rotateZ', 1, false),
	build3DRotationMatcher(),
	buildRotationMatcher('skew', 1, true, 0),
	buildRotationMatcher('skewX', 1, false),
	buildRotationMatcher('skewY', 1, false),
	buildMatcher('translateX', 1, false, true, {px: 0}),
	buildMatcher('translateY', 1, false, true, {px: 0}),
	buildMatcher('translateZ', 1, false, true, {px: 0}),
	buildMatcher('translate', 1, true, true, {px: 0}),
	buildMatcher('translate3d', 3, false, true),
	buildMatcher('scale', 1, true, false, 'copy'),
	buildMatcher('scaleX', 1, false, false, 1),
	buildMatcher('scaleY', 1, false, false, 1),
	buildMatcher('scaleZ', 1, false, false, 1),
	buildMatcher('scale3d', 3, false, false),
	buildMatcher('perspective', 1, false, true),
	buildMatcher('matrix', 6, false, false)
];

var decomposeMatrix = (function() {
	// this is only ever used on the perspective matrix, which has 0, 0, 0, 1 as
	// last column
	function determinant(m) {
		return m[0][0] * m[1][1] * m[2][2] +
					 m[1][0] * m[2][1] * m[0][2] +
					 m[2][0] * m[0][1] * m[1][2] -
					 m[0][2] * m[1][1] * m[2][0] -
					 m[1][2] * m[2][1] * m[0][0] -
					 m[2][2] * m[0][1] * m[1][0];
	}

	// this is only ever used on the perspective matrix, which has 0, 0, 0, 1 as
	// last column
	//
	// from Wikipedia:
	//
	// [A B]^-1 = [A^-1 + A^-1B(D - CA^-1B)^-1CA^-1		 -A^-1B(D - CA^-1B)^-1]
	// [C D]			[-(D - CA^-1B)^-1CA^-1								(D - CA^-1B)^-1			]
	//
	// Therefore
	//
	// [A [0]]^-1 = [A^-1			 [0]]
	// [C	1 ]			[ -CA^-1		 1 ]
	function inverse(m) {
		var iDet = 1 / determinant(m);
		var a = m[0][0], b = m[0][1], c = m[0][2];
		var d = m[1][0], e = m[1][1], f = m[1][2];
		var g = m[2][0], h = m[2][1], k = m[2][2];
		var Ainv = [
			[(e * k - f * h) * iDet, (c * h - b * k) * iDet,
			 (b * f - c * e) * iDet, 0],
			[(f * g - d * k) * iDet, (a * k - c * g) * iDet,
			 (c * d - a * f) * iDet, 0],
			[(d * h - e * g) * iDet, (g * b - a * h) * iDet,
			 (a * e - b * d) * iDet, 0]
		];
		var lastRow = [];
		for (var i = 0; i < 3; i++) {
			var val = 0;
			for (var j = 0; j < 3; j++) {
				val += m[3][j] * Ainv[j][i];
			}
			lastRow.push(val);
		}
		lastRow.push(1);
		Ainv.push(lastRow);
		return Ainv;
	}

	function transposeMatrix4(m) {
		return [[m[0][0], m[1][0], m[2][0], m[3][0]],
						[m[0][1], m[1][1], m[2][1], m[3][1]],
						[m[0][2], m[1][2], m[2][2], m[3][2]],
						[m[0][3], m[1][3], m[2][3], m[3][3]]];
	}

	function multVecMatrix(v, m) {
		var result = [];
		for (var i = 0; i < 4; i++) {
			var val = 0;
			for (var j = 0; j < 4; j++) {
				val += v[j] * m[j][i];
			}
			result.push(val);
		}
		return result;
	}

	function normalize(v) {
		var len = length(v);
		return [v[0] / len, v[1] / len, v[2] / len];
	}

	function length(v) {
		return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
	}

	function combine(v1, v2, v1s, v2s) {
		return [v1s * v1[0] + v2s * v2[0], v1s * v1[1] + v2s * v2[1],
						v1s * v1[2] + v2s * v2[2]];
	}

	function cross(v1, v2) {
		return [v1[1] * v2[2] - v1[2] * v2[1],
						v1[2] * v2[0] - v1[0] * v2[2],
						v1[0] * v2[1] - v1[1] * v2[0]];
	}

	function decomposeMatrix(matrix) {
		var m3d = [[matrix[0], matrix[1], 0, 0],
							 [matrix[2], matrix[3], 0, 0],
							 [0, 0, 1, 0],
							 [matrix[4], matrix[5], 0, 1]];

		// skip normalization step as m3d[3][3] should always be 1
		if (m3d[3][3] !== 1) {
			throw 'attempt to decompose non-normalized matrix';
		}

		var perspectiveMatrix = m3d.concat(); // copy m3d
		for (var i = 0; i < 3; i++) {
			perspectiveMatrix[i][3] = 0;
		}

		if (determinant(perspectiveMatrix) === 0) {
			return false;
		}

		var rhs = [];

		var perspective;
		if (m3d[0][3] !== 0 || m3d[1][3] !== 0 || m3d[2][3] !== 0) {
			rhs.push(m3d[0][3]);
			rhs.push(m3d[1][3]);
			rhs.push(m3d[2][3]);
			rhs.push(m3d[3][3]);

			var inversePerspectiveMatrix = inverse(perspectiveMatrix);
			var transposedInversePerspectiveMatrix =
					transposeMatrix4(inversePerspectiveMatrix);
			perspective = multVecMatrix(rhs, transposedInversePerspectiveMatrix);
		} else {
			perspective = [0, 0, 0, 1];
		}

		var translate = m3d[3].slice(0, 3);

		var row = [];
		row.push(m3d[0].slice(0, 3));
		var scale = [];
		scale.push(length(row[0]));
		row[0] = normalize(row[0]);

		var skew = [];
		row.push(m3d[1].slice(0, 3));
		skew.push(dot(row[0], row[1]));
		row[1] = combine(row[1], row[0], 1.0, -skew[0]);

		scale.push(length(row[1]));
		row[1] = normalize(row[1]);
		skew[0] /= scale[1];

		row.push(m3d[2].slice(0, 3));
		skew.push(dot(row[0], row[2]));
		row[2] = combine(row[2], row[0], 1.0, -skew[1]);
		skew.push(dot(row[1], row[2]));
		row[2] = combine(row[2], row[1], 1.0, -skew[2]);

		scale.push(length(row[2]));
		row[2] = normalize(row[2]);
		skew[1] /= scale[2];
		skew[2] /= scale[2];

		var pdum3 = cross(row[1], row[2]);
		if (dot(row[0], pdum3) < 0) {
			for (var i = 0; i < 3; i++) {
				scale[i] *= -1;
				row[i][0] *= -1;
				row[i][1] *= -1;
				row[i][2] *= -1;
			}
		}

		var t = row[0][0] + row[1][1] + row[2][2] + 1;
		var s;
		var quaternion;

		if (t > 1e-4) {
			s = 0.5 / Math.sqrt(t);
			quaternion = [
				(row[2][1] - row[1][2]) * s,
				(row[0][2] - row[2][0]) * s,
				(row[1][0] - row[0][1]) * s,
				0.25 / s
			];
		} else if (row[0][0] > row[1][1] && row[0][0] > row[2][2]) {
			s = Math.sqrt(1 + row[0][0] - row[1][1] - row[2][2]) * 2.0;
			quaternion = [
				0.25 * s,
				(row[0][1] + row[1][0]) / s,
				(row[0][2] + row[2][0]) / s,
				(row[2][1] - row[1][2]) / s
			];
		} else if (row[1][1] > row[2][2]) {
			s = Math.sqrt(1.0 + row[1][1] - row[0][0] - row[2][2]) * 2.0;
			quaternion = [
				(row[0][1] + row[1][0]) / s,
				0.25 * s,
				(row[1][2] + row[2][1]) / s,
				(row[0][2] - row[2][0]) / s
			];
		} else {
			s = Math.sqrt(1.0 + row[2][2] - row[0][0] - row[1][1]) * 2.0;
			quaternion = [
				(row[0][2] + row[2][0]) / s,
				(row[1][2] + row[2][1]) / s,
				0.25 * s,
				(row[1][0] - row[0][1]) / s
			];
		}

		return {
			translate: translate, scale: scale, skew: skew,
			quaternion: quaternion, perspective: perspective
		};
	}
	return decomposeMatrix;
})();

function dot(v1, v2) {
	var result = 0;
	for (var i = 0; i < v1.length; i++) {
		result += v1[i] * v2[i];
	}
	return result;
}

function multiplyMatrices(a, b) {
	return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
					a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
					a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

function convertItemToMatrix(item) { // !!!
	switch (item.t) {
		case 'rotate':
			var amount = item.d * Math.PI / 180;
			return [Math.cos(amount), Math.sin(amount),
							-Math.sin(amount), Math.cos(amount), 0, 0];
		case 'scale':
			return [item.d[0], 0, 0, item.d[1], 0, 0];
		// TODO: Work out what to do with non-px values.
		case 'translate':
			return [1, 0, 0, 1, item.d[0].px, item.d[1].px];
		case 'matrix':
			return item.d;
	}
}

function convertToMatrix(transformList) {
	return transformList.map(convertItemToMatrix).reduce(multiplyMatrices);
}

var composeMatrix = (function() {
	function multiply(a, b) {
		var result = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
		for (var i = 0; i < 4; i++) {
			for (var j = 0; j < 4; j++) {
				for (var k = 0; k < 4; k++) {
					result[i][j] += b[i][k] * a[k][j];
				}
			}
		}
		return result;
	}

	function composeMatrix(translate, scale, skew, quat, perspective) {
		var matrix = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

		for (var i = 0; i < 4; i++) {
			matrix[i][3] = perspective[i];
		}

		for (var i = 0; i < 3; i++) {
			for (var j = 0; j < 3; j++) {
				matrix[3][i] += translate[j] * matrix[j][i];
			}
		}

		var x = quat[0], y = quat[1], z = quat[2], w = quat[3];

		var rotMatrix = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

		rotMatrix[0][0] = 1 - 2 * (y * y + z * z);
		rotMatrix[0][1] = 2 * (x * y - z * w);
		rotMatrix[0][2] = 2 * (x * z + y * w);
		rotMatrix[1][0] = 2 * (x * y + z * w);
		rotMatrix[1][1] = 1 - 2 * (x * x + z * z);
		rotMatrix[1][2] = 2 * (y * z - x * w);
		rotMatrix[2][0] = 2 * (x * z - y * w);
		rotMatrix[2][1] = 2 * (y * z + x * w);
		rotMatrix[2][2] = 1 - 2 * (x * x + y * y);

		matrix = multiply(matrix, rotMatrix);

		var temp = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
		if (skew[2]) {
			temp[2][1] = skew[2];
			matrix = multiply(matrix, temp);
		}

		if (skew[1]) {
			temp[2][1] = 0;
			temp[2][0] = skew[0];
			matrix = multiply(matrix, temp);
		}

		for (var i = 0; i < 3; i++) {
			for (var j = 0; j < 3; j++) {
				matrix[i][j] *= scale[i];
			}
		}

		return {t: 'matrix', d: [matrix[0][0], matrix[0][1],
														 matrix[1][0], matrix[1][1],
														 matrix[3][0], matrix[3][1]]};
	}
	return composeMatrix;
})();

function interpolateTransformsWithMatrices(from, to, f) {
	var fromM = decomposeMatrix(convertToMatrix(from));
	var toM = decomposeMatrix(convertToMatrix(to));

	var product = dot(fromM.quaternion, toM.quaternion);
	product = clamp(product, -1.0, 1.0);

	var quat = [];
	if (product === 1.0) {
		quat = fromM.quaternion;
	} else {
		var theta = Math.acos(product);
		var w = Math.sin(f * theta) * 1 / Math.sqrt(1 - product * product);

		for (var i = 0; i < 4; i++) {
			quat.push(fromM.quaternion[i] * (Math.cos(f * theta) - product * w) +
								toM.quaternion[i] * w);
		}
	}

	var translate = interp(fromM.translate, toM.translate, f);
	var scale = interp(fromM.scale, toM.scale, f);
	var skew = interp(fromM.skew, toM.skew, f);
	var perspective = interp(fromM.perspective, toM.perspective, f);

	return composeMatrix(translate, scale, skew, quat, perspective);
}

function interpTransformValue(from, to, f) {
	var type = from.t ? from.t : to.t;
	switch (type) {
		// Transforms with unitless parameters.
		case 'rotate':
		case 'rotateX':
		case 'rotateY':
		case 'rotateZ':
		case 'scale':
		case 'scaleX':
		case 'scaleY':
		case 'scaleZ':
		case 'scale3d':
		case 'skew':
		case 'skewX':
		case 'skewY':
		case 'matrix':
			return {t: type, d: interp(from.d, to.d, f, type)}; // are rotate and skew ok here? should be wrapped in an array. and rotate is not unitless...
		default:
			// Transforms with lengthType parameters.
			var result = [];
			var maxVal;
			if (from.d && to.d) {
				maxVal = Math.max(from.d.length, to.d.length);
			} else if (from.d) {
				maxVal = from.d.length;
			} else {
				maxVal = to.d.length;
			}
			for (var j = 0; j < maxVal; j++) {
				var fromVal = from.d ? from.d[j] : {};
				var toVal = to.d ? to.d[j] : {};
				result.push(lengthType.interpolate(fromVal, toVal, f));
			}
			//console.log("interp result:%s;",JSON.stringify(result));
			return {t: type, d: result};
	}
}

// The CSSWG decided to disallow scientific notation in CSS property strings
// (see http://lists.w3.org/Archives/Public/www-style/2010Feb/0050.html).
// We need this function to hakonitize all numbers before adding them to
// property strings.
// TODO: Apply this function to all property strings
function n(num) {
	return Number(num).toFixed(4);
}

function T_R_A_N_S_F_O_R_M___T_Y_P_E() {

}



var transformType = {
	toString: function() {
		return "transformType";
	},
	inverse: function(value) { // KxDx // TODO: SVG mode! see toCssValue // Using numberType not lengthType for transforms and perspective, probably should revert back
		var verbose = false;
		// TODO: fix this :) matrix is way off // need SVG mode! see toCssValue // Using numberType not lengthType for transforms and perspective, probably should revert back
		var delta = this.zero(value);
		var out = [];
		for (var i = 0; i < value.length; i++) {
			ASSERT_ENABLED && assert( value[i].t, 'transform type should be resolved by now');
			
			switch (value[i].t) {
				case 'rotate':
				case 'rotateX':
				case 'rotateY':
				case 'rotateZ':
				case 'skewX':
				case 'skewY':
					out.push({t : value[i].t, d : [numberType.inverse(value[i].d[0])]}); // new style, have to unwrap then re-wrap
					break;
				case 'skew':
					out.push({ t : value[i].t, d : [numberType.inverse(value[i].d[0]), numberType.inverse(value[i].d[1])] });
					break;
				case 'translateX':
				case 'translateY':
				case 'translateZ':
				case 'perspective':
					out.push({t : value[i].t, d : [numberType.inverse(value[i].d[0])]	});
					break;
				case 'translate':
				 out.push({t : value[i].t, d : [{px : numberType.inverse(value[i].d[0].px)}, {px : numberType.inverse(value[i].d[1].px)}] });
					break;
				case 'translate3d':
					out.push({t : value[i].t, d : [{px : numberType.inverse(value[i].d[0].px)}, {px : numberType.inverse(value[i].d[1].px)}, {px : numberType.inverse(value[i].d[2].px)}	 ] });
					break;
				case 'scale':
					out.push({ t : value[i].t, d : [delta[i].d[0]/value[i].d[0], delta[i].d[1]/value[i].d[1]] }); // inverse of 2 is 1/2
					break;
				case 'scaleX':
				case 'scaleY':
				case 'scaleZ':
					out.push({t : value[i].t, d : [ delta[i].d[0]/value[i].d[0]]}); // inverse of 2 is 1/2
					break;
				case 'scale3d':
					out.push({ t : value[i].t, d : [ delta[i].d[0]/value[i].d[0], delta[i].d[1]/value[i].d[1], -1/value[i].d[2]] }); // inverse of 2 is 1/2
					break;
				case 'matrix':
					out.push({ t : value[i].t, d : [numberType.inverse(value[i].d[0]), numberType.inverse(value[i].d[1]), numberType.inverse(value[i].d[2]), numberType.inverse(value[i].d[3]), numberType.inverse(value[i].d[4]), numberType.inverse(value[i].d[5])] });
					break;
			}
		}
		if (verbose) console.log("TransformType inverse out:%s;",JSON.stringify(out));
		return out;
	},
	
	add: function(base, delta) {
		if (!base) { // This happens often...
			//throw("transformType add with no base!");
			base = [];
		}
		var baseLength = base.length;
		var deltaLength = delta.length;
		
		if (baseLength && deltaLength && baseLength >= deltaLength) {
			var diff = baseLength - deltaLength;
			var out = [];
			var match = true;
			var j = 0;
			for (var i = diff; i < baseLength; i++) {
				if (base[i].t != delta[j].t) {
				match = false;
				break;
			}
				j++;
			}
			if (match) return this.sum(base,delta);
		}
		return base.concat(delta); 
	},
	
	
	sum: function(value,delta) { // add is for the full values, sum is for their components // need SVG mode! see toCssValue // Using numberType not lengthType for transforms and perspective, probably should revert back
		var verbose = false;
		// TODO: fix this :) matrix is way off // need SVG mode! see toCssValue // Using numberType not lengthType for transforms and perspective, probably should revert back
		var out = [];
		var valueLength = value.length;
		var deltaLength = delta.length;
		var diff = valueLength-deltaLength;
		var j = 0;
		for (var i = 0; i < valueLength; i++) {
			ASSERT_ENABLED && assert(value[i].t, 'transform type should be resolved by now');
			if (i < diff) {
				out.push(value[i])
			} else {
				switch (value[i].t) {
					// TODO: rotate3d(1, 2.0, 3.0, 10deg);
					case 'rotate':
					case 'rotateX':
					case 'rotateY':
					case 'rotateZ':
					case 'skewX':
					case 'skewY':
						out.push({t : value[i].t, d : [numberType.add(value[i].d[0],delta[j].d[0])]}); // new style, have to unwrap then re-wrap
						break;
					case 'skew':
						out.push({ t : value[i].t, d : [numberType.add(value[i].d[0],delta[j].d[0]), numberType.add(value[i].d[1],delta[j].d[1])] });
						break;
					case 'translateX':
					case 'translateY':
					case 'translateZ':
					case 'perspective':
						out.push({t : value[i].t, d : [numberType.add(value[i].d[0],delta[j].d[0])]	});
						break;
					case 'translate': 
						out.push({t : value[i].t, d : [{px : numberType.add(value[i].d[0].px,delta[j].d[0].px)}, {px : numberType.add(value[i].d[1].px,delta[j].d[1].px)}] });
						break;
					case 'translate3d':
						out.push({t : value[i].t, d : [{px : numberType.add(value[i].d[0].px,delta[j].d[0].px)}, {px : numberType.add(value[i].d[1].px,delta[j].d[1].px)}, {px : numberType.add(value[i].d[2].px,delta[j].d[2].px)}	 ] });
						break;
					case 'scale':
						out.push({ t : value[i].t, d : [value[i].d[0] * delta[j].d[0], value[i].d[1] * delta[j].d[1]] });
						break;
					case 'scaleX':
					case 'scaleY':
					case 'scaleZ':
						out.push({t : value[i].t, d : [value[i].d[0] * delta[j].d[0]]});
						break;
					case 'scale3d':
						out.push({ t : value[i].t, d : [value[i].d[0] * delta[j].d[0], value[i].d[1] * delta[j].d[1], value[i].d[2] * delta[j].d[2]] });
						break;
					case 'matrix':
						out.push({ t : value[i].t, d : [numberType.add(value[i].d[0],delta[j].d[0]), numberType.add(value[i].d[1],delta[j].d[1]), numberType.add(value[i].d[2],delta[j].d[2]), numberType.add(value[i].d[3],delta[j].d[3]), numberType.add(value[i].d[4],delta[j].d[4]), numberType.add(value[i].d[5],delta[j].d[5])] });
						break;
					case "matrix3d":
						console.log("TransformType sum matrix3d not supported");
					default:
						console.log("TransformType sum no type?");
				}
				j++;
			}
		}
		if (verbose) console.log("TransformType sum out:%s;",JSON.stringify(out));
		return out;
	},
	
	zero: function(value) { // KxDx // requires an old value for type // need SVG mode! see toCssValue // Using numberType not lengthType for transforms and perspective, probably should revert back
		var verbose = false;
		// TODO: fix this :) matrix is way off // need SVG mode! see toCssValue // Using numberType not lengthType for transforms and perspective, probably should revert back
		if (verbose) console.log("TransformType zero:%s;",JSON.stringify(value));
		if (!value) return [{ t : "matrix", d : [1, 0, 0, 0, 1 ,0] }];
		var out = [];
		//var i = 0;
		for (var i = 0; i < value.length; i++) {
			ASSERT_ENABLED && assert(
					value[i].t, 'transform type should be resolved by now');
			
			switch (value[i].t) {
				// TODO: rotate3d(1, 2.0, 3.0, 10deg);
				case 'rotate':
				case 'rotateX':
				case 'rotateY':
				case 'rotateZ':
				case 'skewX':
				case 'skewY':
					out.push({t : value[i].t, d : [0]}); // new style
					break;
				case 'skew':
					out.push({ t : value[i].t, d : [0,0] });
					break;
				case 'translateX':
				case 'translateY':
				case 'translateZ':
				case 'perspective':
					out.push({t : value[i].t, d : [0]	});
					break;
				case 'translate':
					out.push({t : value[i].t, d : [{px : 0}, {px : 0}] });
					break;
				case 'translate3d':
					out.push({t : value[i].t, d : [{px : 0}, {px : 0}, {px : 0}	 ] });
					break;
				case 'scale':
					out.push({ t : value[i].t, d : [1, 1] });
					break;
				case 'scaleX':
				case 'scaleY':
				case 'scaleZ':
					out.push({t : value[i].t, d : [1]});
					break;
				case 'scale3d':
					out.push({ t : value[i].t, d : [1, 1, 1] });
					break;
				case 'matrix':
					// this is not correct:
							out.push({ t : value[i].t, d : [1, 0, 0, 0, 1 ,0] });
					
					break;
			}
		}
		if (verbose) console.log("TransformType zero out:%s;",JSON.stringify(out));
		return out;
		
	},
	
	
	
	subtract: function(base,delta) {
		var inverse = this.inverse(delta);
		return this.add(base,inverse);
	},
	
	
	interpolate: function(from, to, f) {
		
		var out = [];
		for (var i = 0; i < Math.min(from.length, to.length); i++) {
			if (from[i].t !== to[i].t) {
				break;
			}
			out.push(interpTransformValue(from[i], to[i], f));
		}

		if (i < Math.min(from.length, to.length)) {
			out.push(interpolateTransformsWithMatrices(from.slice(i), to.slice(i),
					f));
			return out;
		}

		for (; i < from.length; i++) {
			out.push(interpTransformValue(from[i], {t: null, d: null}, f));
		}
		for (; i < to.length; i++) {
			out.push(interpTransformValue({t: null, d: null}, to[i], f));
		}
		return out;
	},
	
	toCssValue: function(value, svgMode) {
		// TODO: fix this :)
		var out = '';
		for (var i = 0; i < value.length; i++) {
			ASSERT_ENABLED && assert( value[i].t, 'transform type should be resolved by now');
					
			switch (value[i].t) {
				// TODO: rotate3d(1, 2.0, 3.0, 10deg);
				case 'rotate':
				case 'rotateX':
				case 'rotateY':
				case 'rotateZ':
				case 'skewX':
				case 'skewY':
					var unit = svgMode ? '' : 'deg';
					out += value[i].t + '(' + value[i].d[0] + unit + ') '; // modified. value[i].d is wrapped in an array, converting array to string worked previously but this is correct. If you don't like it, fix fromCssValue and change inverse, sum, and zero
					break;
				case 'skew':
					var unit = svgMode ? '' : 'deg';
					out += value[i].t + '(' + value[i].d[0] + unit;
					if (value[i].d[1] === 0) {
						out += ') ';
					} else {
						out += ', ' + value[i].d[1] + unit + ') ';
					}
					break;
				case 'translateX':
				case 'translateY':
				case 'translateZ':
				case 'perspective':
					out += value[i].t + '(' + lengthType.toCssValue(value[i].d[0]) +
							') ';
					break;
				case 'translate':
					if (svgMode) {
						if (value[i].d[1] === undefined) {
							out += value[i].t + '(' + value[i].d[0].px + ') ';
						} else {
							out += value[i].t + '(' + value[i].d[0].px + ', ' + value[i].d[1].px + ') ';
						}
						break;
					}
					if (value[i].d[1] === undefined) {
						out += value[i].t + '(' + lengthType.toCssValue(value[i].d[0]) + ') ';
					} else {
						out += value[i].t + '(' + lengthType.toCssValue(value[i].d[0]) + ', ' + lengthType.toCssValue(value[i].d[1]) + ') ';
					}
					break;
				case 'translate3d':
					var values = value[i].d.map(lengthType.toCssValue);
					out += value[i].t + '(' + values[0] + ', ' + values[1] + ', ' + values[2] + ') ';
					break;
				case 'scale':
					if (value[i].d[0] === value[i].d[1]) {
						out += value[i].t + '(' + value[i].d[0] + ') ';
					} else {
						out += value[i].t + '(' + value[i].d[0] + ', ' + value[i].d[1] + ') ';
					}
					break;
				case 'scaleX':
				case 'scaleY':
				case 'scaleZ':
					out += value[i].t + '(' + value[i].d[0] + ') ';
					break;
				case 'scale3d':
					out += value[i].t + '(' + value[i].d[0] + ', ' +
					value[i].d[1] + ', ' + value[i].d[2] + ') ';
					break;
				case 'matrix':
					out += value[i].t + '(' +
					n(value[i].d[0]) + ', ' + n(value[i].d[1]) + ', ' +
					n(value[i].d[2]) + ', ' + n(value[i].d[3]) + ', ' +
					n(value[i].d[4]) + ', ' + n(value[i].d[5]) + ') ';
					break;
			}
		}
		return out.substring(0, out.length - 1);
	},
	
	fromCssValue: function(value) {
		// TODO: fix this :)
		// TODO: need rotate3d(1, 2.0, 3.0, 10deg);
		if (value === undefined) {
			return undefined;
		}
		var result = [];
		while (value.length > 0) {
			var r;
			for (var i = 0; i < transformREs.length; i++) {
				var reSpec = transformREs[i];
				r = reSpec[0].exec(value);
				if (r) {
					result.push({t: reSpec[2], d: reSpec[1](r)});
					value = value.substring(r[0].length);
					break;
				}
			}
			if (!isDefinedAndNotNull(r)) {
				return result;
			}
		}
		return result;
	}
};

var propertyTypes = {
	backgroundColor: colorType,
	backgroundPosition: positionListType,
	borderBottomColor: colorType,
	borderBottomLeftRadius: percentLengthType,
	borderBottomRightRadius: percentLengthType,
	borderBottomWidth: lengthType,
	borderLeftColor: colorType,
	borderLeftWidth: lengthType,
	borderRightColor: colorType,
	borderRightWidth: lengthType,
	borderSpacing: lengthType,
	borderTopColor: colorType,
	borderTopLeftRadius: percentLengthType,
	borderTopRightRadius: percentLengthType,
	borderTopWidth: lengthType,
	bottom: percentLengthAutoType,
	boxShadow: shadowType,
	clip: typeWithKeywords(['auto'], rectangleType),
	color: colorType,
	cx: lengthType,

	// TODO: Handle these keywords properly.
	fontSize: typeWithKeywords(['smaller', 'larger'], percentLengthType),
	fontWeight: typeWithKeywords(['lighter', 'bolder'], fontWeightType),

	height: percentLengthAutoType,
	left: percentLengthAutoType,
	letterSpacing: typeWithKeywords(['normal'], lengthType),
	lineHeight: percentLengthType, // TODO: Should support numberType as well.
	marginBottom: lengthAutoType,
	marginLeft: lengthAutoType,
	marginRight: lengthAutoType,
	marginTop: lengthAutoType,
	maxHeight: typeWithKeywords(
			['none', 'max-content', 'min-content', 'fill-available', 'fit-content'],
			percentLengthType),
	maxWidth: typeWithKeywords(
			['none', 'max-content', 'min-content', 'fill-available', 'fit-content'],
			percentLengthType),
	minHeight: typeWithKeywords(
			['max-content', 'min-content', 'fill-available', 'fit-content'],
			percentLengthType),
	minWidth: typeWithKeywords(
			['max-content', 'min-content', 'fill-available', 'fit-content'],
			percentLengthType),
	opacity: numberType,
	outlineColor: typeWithKeywords(['invert'], colorType),
	outlineOffset: lengthType,
	outlineWidth: lengthType,
	paddingBottom: lengthType,
	paddingLeft: lengthType,
	paddingRight: lengthType,
	paddingTop: lengthType,
	right: percentLengthAutoType,
	textIndent: typeWithKeywords(['each-line', 'hanging'], percentLengthType),
	textShadow: shadowType,
	top: percentLengthAutoType,
	transform: transformType,
	webkitTransform: transformType, // temporary
	msTransform: transformType, // temporary
	
	verticalAlign: typeWithKeywords([
		'baseline',
		'sub',
		'super',
		'text-top',
		'text-bottom',
		'middle',
		'top',
		'bottom'
	], percentLengthType),
	visibility: visibilityType,
	width: typeWithKeywords([
		'border-box',
		'content-box',
		'auto',
		'max-content',
		'min-content',
		'available',
		'fit-content'
	], percentLengthType),
	wordSpacing: typeWithKeywords(['normal'], percentLengthType),
	x: lengthType,
	y: lengthType,
	zIndex: typeWithKeywords(['auto'], integerType)
};

var svgProperties = {
	'cx': 1,
	'width': 1,
	'x': 1,
	'y': 1
};

var borderWidthAliases = {
	initial: '3px',
	thin: '1px',
	medium: '3px',
	thick: '5px'
};

var propertyValueAliases = {
	backgroundColor: { initial: 'transparent' },
	backgroundPosition: { initial: '0% 0%' },
	borderBottomColor: { initial: 'currentColor' },
	borderBottomLeftRadius: { initial: '0px' },
	borderBottomRightRadius: { initial: '0px' },
	borderBottomWidth: borderWidthAliases,
	borderLeftColor: { initial: 'currentColor' },
	borderLeftWidth: borderWidthAliases,
	borderRightColor: { initial: 'currentColor' },
	borderRightWidth: borderWidthAliases,
	// Spec says this should be 0 but in practise it is 2px.
	borderSpacing: { initial: '2px' },
	borderTopColor: { initial: 'currentColor' },
	borderTopLeftRadius: { initial: '0px' },
	borderTopRightRadius: { initial: '0px' },
	borderTopWidth: borderWidthAliases,
	bottom: { initial: 'auto' },
	clip: { initial: 'rect(0px, 0px, 0px, 0px)' },
	color: { initial: 'black' }, // Depends on user agent.
	fontSize: {
		initial: '100%',
		'xx-small': '60%',
		'x-small': '75%',
		'small': '89%',
		'medium': '100%',
		'large': '120%',
		'x-large': '150%',
		'xx-large': '200%'
	},
	fontWeight: {
		initial: '400',
		normal: '400',
		bold: '700'
	},
	height: { initial: 'auto' },
	left: { initial: 'auto' },
	letterSpacing: { initial: 'normal' },
	lineHeight: {
		initial: '120%',
		normal: '120%'
	},
	marginBottom: { initial: '0px' },
	marginLeft: { initial: '0px' },
	marginRight: { initial: '0px' },
	marginTop: { initial: '0px' },
	maxHeight: { initial: 'none' },
	maxWidth: { initial: 'none' },
	minHeight: { initial: '0px' },
	minWidth: { initial: '0px' },
	opacity: { initial: '1.0' },
	outlineColor: { initial: 'invert' },
	outlineOffset: { initial: '0px' },
	outlineWidth: borderWidthAliases,
	paddingBottom: { initial: '0px' },
	paddingLeft: { initial: '0px' },
	paddingRight: { initial: '0px' },
	paddingTop: { initial: '0px' },
	right: { initial: 'auto' },
	textIndent: { initial: '0px' },
	textShadow: {
		initial: '0px 0px 0px transparent',
		none: '0px 0px 0px transparent'
	},
	top: { initial: 'auto' },
	transform: {
		initial: '',
		none: ''
	},
	verticalAlign: { initial: '0px' },
	visibility: { initial: 'visible' },
	width: { initial: 'auto' },
	wordSpacing: { initial: 'normal' },
	zIndex: { initial: 'auto' }
};

var propertyIsSVGAttrib = function(property, target) {
	return target.namespaceURI === 'http://www.w3.org/2000/svg' &&
			property in svgProperties;
};

var ORIGINALgetType = function(property) {
	return propertyTypes[property] || nonNumericType;
};
var getCssOnlyType = function(property) {
	return propertyTypes[property] || nonNumericType;
};

var getType = function(property,cssValue) { // should be css value
	var type = propertyTypes[property];
	if (!type) {
		if (isNumber(cssValue)) type = numberType;
		else if (cssValue && Array.isArray(cssValue)) type = arrayType;
		else if (cssValue && typeof cssValue === "object") {
			type = objectType;
		}
	}
	if (!type) type = nonNumericType;
	return type;
};


var add = function(property, base, delta, typeObject) { // Called from AddReplaceCompositableValue compositeOnto // transform is an array of rawValues, borderTopWidth is a rawValue, opacity is just a number
	//console.log("ADD property:%s; base:%s; delta:%s;",property,JSON.stringify(base),JSON.stringify(delta));
	
	// ADD property:transform; 
	// base:[{"t":"translate3d","d":[{"px":0},{"px":0.3636363066367203},{"px":0}]}]; 
	// delta:[{"t":"translate3d","d":[{"px":261},{"px":517},{"px":0}]}];
	
	// ADD property:transform; 
	// base:[{"t":"matrix","d":[1,0,0,1,400,0]}]; 
	// delta:[{"t":"translate3d","d":[{"px":0},{"px":0},{"px":0}]}];
	
	// ADD property:opacity;
	// base:1; 
	// delta:0;
	
	// ADD property:borderTopWidth; 
	// base:{"px":19}; 
	// delta:{"px":-18};
	
	// ADD property:flattened; 
	// base:{"t":"array","d":["<TreeModel2 (qwerty 11) [0]>","<TreeModel4 (zxcvb) [1]>","<TreeModel3 (uiop) [1,0]>"]}; 
	// delta:{"t":"array","d":["<TreeModel0 (qwerty 0) [0,0]>","<TreeModel1 (qwerty12) [0,1]>"]};
	
	if (delta === rawNeutralValue) return base;
	if (base === 'inherit' || delta === 'inherit') return nonNumericType.add(base, delta);
	return typeObject.add(base, delta);

};


/**
 * Interpolate the given property name (f*100)% of the way from 'from' to 'to'.
 * 'from' and 'to' are both raw values already converted from CSS value
 * strings. Requires the target element to be able to determine whether the
 * given property is an SVG attribute or not, as this impacts the conversion of
 * the interpolated value back into a CSS value string for transform
 * translations.
 *
 * e.g. interpolate('transform', 'rotate(40deg)', 'rotate(50deg)', 0.3);
 *	 will return 'rotate(43deg)'.
 */
var interpolate = function(property, from, to, f) { // getType problem. values are rawValues not cssValues. Only works because property. Arbitrary types will fail. Called from BlendedCompositableValue compositeOnto:
	//console.log("interpolate:%s; to:%s; type:%s;",property,JSON.stringify(to),getType(property,to).toString());
	ASSERT_ENABLED && assert(isDefinedAndNotNull(from) && isDefinedAndNotNull(to), 'Both to and from values should be specified for interpolation');
	if (from === 'inherit' || to === 'inherit') {
		return nonNumericType.interpolate(from, to, f);
	}
	if (f === 0) {
		return from;
	}
	if (f === 1) {
		return to;
	}
	return getType(property,to).interpolate(from, to, f); // to is a rawValue, not CSS value. will work for numbers but not arrays or objects
};


/**
 * Convert the provided interpolable value for the provided property to a CSS
 * value string. Note that SVG transforms do not require units for translate
 * or rotate values while CSS properties require 'px' or 'deg' units.
 */
var toCssValue = function(property, value, svgMode) { // Only used by CompositedPropertyMap, not CompositedStateMap
	if (value === 'inherit') return value;
	return getCssOnlyType(property,value).toCssValue(value, svgMode);
};

var fromCssValue = function(property, cssValue) {
	console.log("fromCssValue deprecated");
	if (cssValue === cssNeutralValue) return rawNeutralValue;
	if (cssValue === 'inherit') return value;
	if (property in propertyValueAliases && cssValue in propertyValueAliases[property]) {
		cssValue = propertyValueAliases[property][cssValue];
	}
	var result = getType(property,cssValue).fromCssValue(cssValue);
	// Currently we'll hit this assert if input to the API is bad. To avoid this,
	// we should eliminate invalid values when normalizing the list of keyframes.
	// See the TODO in isSupportedPropertyValue().
	ASSERT_ENABLED && assert(isDefinedAndNotNull(result), 'Invalid property value "' + cssValue + '" for property "' + property + '"');
	return result;
};

// Sentinel values
var cssNeutralValue = {};
var rawNeutralValue = {};


function COMPOSITABLE_VALUE() {}
/** @constructor */
var CompositableValue = function() {
};

CompositableValue.prototype = {
	compositeOnto: abstractMethod,
	// This is purely an optimization.
	dependsOnUnderlyingValue: function() {
		return true;
	}
};


function ADD_REPLACE_COMPOSITABLE_VALUE() {}
/** @constructor */
//var AddReplaceCompositableValue = function(rawValue, composite, optionalTimeFractionForStateAnimation) { // original
var AddReplaceCompositableValue = function(propertySpecificKeyframe, composite, optionalTimeFractionForStateAnimation) { // First argument was rawValue, now propertySpecificKeyframe to get typeObject for state animation. But MotionPathEffect also uses, even though there are no frame!
	//this.value = rawValue; // original
	this.value = propertySpecificKeyframe.rawValue();
	this.typeObject = getType(propertySpecificKeyframe.property, propertySpecificKeyframe.cssValue);
	this.composite = composite;
	this.optionalTimeFractionForStateAnimation = optionalTimeFractionForStateAnimation;
	ASSERT_ENABLED && assert( !(this.value === cssNeutralValue && this.composite === 'replace'), 'Should never replace-composite the neutral value');
};

AddReplaceCompositableValue.prototype = createObject(
	CompositableValue.prototype, {
		compositeOnto: function(property, underlyingRawValue) {
			switch (this.composite) {
				case 'replace':
					return this.value;
				case 'add':
					return this.typeObject.add(underlyingRawValue, this.value);
					//return add(property, underlyingValue, this.value, this.typeObject);
				default:
					ASSERT_ENABLED && assert( false, 'Invalid composite operation ' + this.composite);
			}
		},
		dependsOnUnderlyingValue: function() {
			return this.composite === 'add';
		}
	}
);


function BLENDED_COMPOSITABLE_VALUE() {}
/** @constructor */
var BlendedCompositableValue = function(startValue, endValue, fraction) {
	this.startValue = startValue; // AddReplaceCompositableValue
	this.endValue = endValue; // AddReplaceCompositableValue
	this.fraction = fraction;
};

BlendedCompositableValue.prototype = createObject(
	CompositableValue.prototype, {
		compositeOnto: function(property, underlyingRawValue) {
			if (verboseSafariGetComputedStyle) console.log("BlendedCompositableValue compositeOnto property:%s; rawValue:%s;",property,JSON.stringify(underlyingRawValue));
			return interpolate(property,
				this.startValue.compositeOnto(property, underlyingRawValue),
				this.endValue.compositeOnto(property, underlyingRawValue),
				this.fraction);
		},
		dependsOnUnderlyingValue: function() {
			// Travis crashes here randomly in Chrome beta and unstable,
			// this try catch is to help debug the problem.
			try {
				return this.startValue.dependsOnUnderlyingValue() ||
					this.endValue.dependsOnUnderlyingValue();
			} catch (error) {
				throw new Error( error + '\n JSON.stringify(this) = ' + JSON.stringify(this));
			}
		}
	}
);


function ACCUMULATED_COMPOSITABLE_VALUE() {}

/** @constructor */
var AccumulatedCompositableValue = function(bottomValue, accumulatingValue, accumulationCount) {
	this.bottomValue = bottomValue;
	this.accumulatingValue = accumulatingValue;
	this.accumulationCount = accumulationCount;
	ASSERT_ENABLED && assert(this.accumulationCount > 0,
			'Accumumlation count should be strictly positive');
};


AccumulatedCompositableValue.prototype = createObject(
	CompositableValue.prototype, {
		compositeOnto: function(property, underlyingValue) {
			
			// The spec defines accumulation recursively, but we do it iteratively
			// to better handle large numbers of iterations.
			var result = this.bottomValue.compositeOnto(property, underlyingValue);
			for (var i = 0; i < this.accumulationCount; i++) {
				result = this.accumulatingValue.compositeOnto(property, result);
			}
			return result;
		},
		dependsOnUnderlyingValue: function() {
			return this.bottomValue.dependsOnUnderlyingValue() &&
					this.accumulatingValue.dependsOnUnderlyingValue();
		}
	}
);






function COMPOSITED_STATE_MAP() {}
/** @constructor */
var CompositedStateMap = function(target,attribute) { // CompositedPropertyMap
	this.properties = {};
	this.baseValues = {};
	this.target = target;
	this.attribute = attribute;
	this.animatedValues = {};	
};

CompositedStateMap.prototype = {
	addValue: function(property, animValue) { // called from Compositor setAnimatedValue which is called from BasicEffect _sample which is called from Animation _sample which is called from ticker as it loops through each sorted animation
		if (!(property in this.properties)) {
			this.properties[property] = [];
		}
		if (!(animValue instanceof CompositableValue)) throw new TypeError('expected CompositableValue');
		this.properties[property].push(animValue);
	},
	stackDependsOnUnderlyingValue: function(stack) {
		for (var i = 0; i < stack.length; i++) {
			if (!stack[i].dependsOnUnderlyingValue()) {
				return false;
			}
		}
		return true;
	},
	clear: function() { // called from Compositor applyAnimatedValues from ticker // clearValue calls target.style._clearAnimatedProperty(property) which copies over from _surrogateElement to real inline style, in preparation for getComputedStyle
		this.animatedValues = {};
	},
	captureBaseValues: function() { // called from Compositor applyAnimatedValues which is called from ticker
	 	
	},
	applyAnimatedValues: function() { // called from Compositor applyAnimatedValues which is called from ticker
		
		for (var property in this.properties) {
			var compositableValues = this.properties[property];
			var baseValue = this.baseValues[property];
			var baseCssValue = this.target.state[property]; // this is actually presentation value if already animated, but needed for type
			var typeObject = getType(property,baseCssValue);
		
			if (!isDefinedAndNotNull(baseValue)) {
		 		baseValue = typeObject.fromCssValue(baseCssValue);
		 		this.baseValues[property] = baseValue;
			}
			if (compositableValues.length) {
				this.properties[property] = [];
			
				var i = compositableValues.length - 1;
				while (i > 0 && compositableValues[i].dependsOnUnderlyingValue()) {
					i--;
				}
				for (; i < compositableValues.length; i++) {
					baseValue = compositableValues[i].compositeOnto(property, baseValue);
				}
			}
			ASSERT_ENABLED && assert( isDefinedAndNotNull(baseValue) && baseValue !== '', 'Value should always be set after compositing');
				
			var finalRawValue = baseValue;
			var finalValue = typeObject.toCssValue(finalRawValue);
			var finalState = {};
			finalState[property] = finalValue;
			var current = this.target.state[property];
			var isAnArray = isArray(finalValue);
			var dirty = false;
			if (!isAnArray && current !== finalValue) dirty = true;
			if (isAnArray) { // I would prefer to check if timeFraction has changed
				if (current.length != finalValue.length) dirty = true;
				else {
					var i = current.length;
					while (i--) {
						if (current[i] != finalValue[i]) {
							dirty = true;
							break;
						}
					}
				}
			}
			if (dirty) {
				this.target.setState(finalState);
			}
			 
		}
	}
};




var verboseSafariGetComputedStyle = false;



function COMPOSITED_PROPERTY_MAP() {}
/** @constructor */
var CompositedPropertyMap = function(target) { // CompositedPropertyMap
	this.properties = {};
	this.baseValues = {};
	this.target = target;
};

CompositedPropertyMap.prototype = {
	addValue: function(property, animValue) { // called from Compositor setAnimatedValue which is called from BasicEffect _sample which is called from Animation _sample which is called from ticker as it loops through each sorted animation
		if (!(property in this.properties)) {
			this.properties[property] = [];
		}
		if (!(animValue instanceof CompositableValue)) {
			throw new TypeError('expected CompositableValue');
		}
		this.properties[property].push(animValue);
	},
	stackDependsOnUnderlyingValue: function(stack) {
		for (var i = 0; i < stack.length; i++) {
			if (!stack[i].dependsOnUnderlyingValue()) {
				return false;
			}
		}
		return true;
	},
	clear: function() { // from Compositor applyAnimatedValues from ticker // clearValue calls target.style._clearAnimatedProperty(property) which copies over from _surrogateElement to real inline style, in preparation for getComputedStyle
		for (var property in this.properties) {
			if (this.stackDependsOnUnderlyingValue(this.properties[property])) {
				var target = this.target;
				ensureTargetInitialized(property, target);
				if (property === 'transform') {
					property = features.transformProperty;
				}
				if (propertyIsSVGAttrib(property, target)) {
					target.actuals[property] = null;
				} else {
					target.style._clearAnimatedProperty(property);
				}
			}
		}
	},
	
	captureBaseValues: function() { // FORCES RECALCULATION // called from Compositor applyAnimatedValues which is called from ticker
		
		// This is target for optimization to prevent layout thrashing.
		// Why capture base values at every frame?
		// Style sheet or className changes are the problem.
		
		for (var property in this.properties) {
			var stack = this.properties[property];
			if (stack.length > 0 && this.stackDependsOnUnderlyingValue(stack)) {
				var target = this.target;
				ensureTargetInitialized(property, target);
				var prefixedProperty = property;
				if (property === 'transform') {
					prefixedProperty = features.transformProperty;
					if (verboseSafariGetComputedStyle) console.log("CompositedPropertyMap captureBaseValues transform prefixedProperty:%s;",prefixedProperty);
				}
				var cssValue;
				if (propertyIsSVGAttrib(property, target)) { // TODO: unsure about SVG. prefixes?
					cssValue = target.actuals[property];
				} else {
					//var computed = getComputedStyle(target);
					var computed = window.getComputedStyle(target); // Safari fail...
					var computedProperty = computed[prefixedProperty];
					if (verboseSafariGetComputedStyle) console.log("CompositedPropertyMap captureBaseValues computedProperty:%s; nonPrefixed:%s;",computedProperty,computed[property]);
					if (prefixedProperty === features.transformProperty) { // preserve transform functions for addition. getComputedStyle returns matrix
						var inline = this.target.style._surrogateElement.style[prefixedProperty]; // accessing private ...
						if (verboseSafariGetComputedStyle) console.log("CompositedPropertyMap captureBaseValues inline:%s;",inline);
						if (isDefinedAndNotNull(inline) && inline.length) computedProperty = inline;
						else {
							var matrixRegex = /^matrix/; // why does Chrome getComputedStyle with rotate(-180deg) give a matrix with scientific notation? Must convert.
							if (matrixRegex.test(computedProperty)) { // matrix(-1, 1.22464679914735e-16, -1.22464679914735e-16, -1, 0, 0) // why does Chrome getComputedStyle with rotate(-180deg) give a matrix with scientific notation? Must convert.
								var scientificNotationRegex = /-?\d*\.?\d+e-\d+\s*,/g; // TODO: This assumes all scientific notation values are small, not large. Large values are probably error and would not give visible results, but they should still not break like this.
								computedProperty = computedProperty.replace(scientificNotationRegex,"0, ");
							}
						}
					}
					cssValue = computedProperty;
				}
				if (verboseSafariGetComputedStyle) console.log("CompositedPropertyMap captureBaseValues property:%s; cssValue:%s;",property,cssValue);		
				var typeObject = getType(property,cssValue);
				var baseValue = typeObject.fromCssValue(cssValue);
				if (verboseSafariGetComputedStyle) console.log("CompositedPropertyMap captureBaseValues type:%s; baseValue:%s;",typeObject.toString(),JSON.stringify(baseValue));
				// TODO: Decide what to do with elements not in the DOM.
				ASSERT_ENABLED && assert( isDefinedAndNotNull(baseValue) && baseValue !== '', 'Base value should always be set. ' + 'Is the target element in the DOM?'); // CompositedPropertyMap
				this.baseValues[property] = baseValue;
			} else {
				this.baseValues[property] = undefined;
			}
		}
	},
	
	applyAnimatedValues: function() { // called from Compositor applyAnimatedValues which is called from ticker
		for (var property in this.properties) {
			var compositableValues = this.properties[property];
			if (compositableValues.length === 0) {
				continue;
			}
			this.properties[property] = [];
			
			var baseValue = this.baseValues[property]; // rawValue
			if (verboseSafariGetComputedStyle) console.log("CompositedPropertyMap apply baseValue:%s;",JSON.stringify(baseValue));
			var i = compositableValues.length - 1;
			while (i > 0 && compositableValues[i].dependsOnUnderlyingValue()) {
				i--;
			}
			for (; i < compositableValues.length; i++) {
				if (verboseSafariGetComputedStyle) console.log("CompositedPropertyMap composite baseValue:%s;",JSON.stringify(baseValue));
				baseValue = compositableValues[i].compositeOnto(property, baseValue);
			}
			ASSERT_ENABLED && assert( isDefinedAndNotNull(baseValue) && baseValue !== '', 'Value should always be set after compositing');
			var isSvgMode = propertyIsSVGAttrib(property, this.target);
			var value = toCssValue(property, baseValue, isSvgMode);
			var target = this.target;
			ensureTargetInitialized(property, target);
			if (property === 'transform') {
				property = features.transformProperty;
			}
			if (propertyIsSVGAttrib(property, target)) {
				target.actuals[property] = value;
			} else {
				target.style._setAnimatedProperty(property, value);
			}
		}
	}
};


var cssStyleDeclarationAttribute = {
	cssText: true,
	length: true,
	parentRule: true,
	'var': true
};

var cssStyleDeclarationMethodModifiesStyle = {
	getPropertyValue: false,
	getPropertyCSSValue: false,
	removeProperty: true,
	getPropertyPriority: false,
	setProperty: true,
	item: false
};

var copyInlineStyle = function(sourceStyle, destinationStyle) {
	for (var i = 0; i < sourceStyle.length; i++) {
		var property = sourceStyle[i];
		destinationStyle[property] = sourceStyle[property];
	}
};

var retickThenGetComputedStyle = function() {
	if (verboseSafariGetComputedStyle) console.log("??? retick isPatched:%s; original:%s;",isGetComputedStylePatched,originalGetComputedStyle);
	if (isDefined(lastTickTime)) {
		repeatLastTick();
	} else {
		if (verboseSafariGetComputedStyle) console.log("??? retickThenGetComputedStyle ensure");
		ensureOriginalGetComputedStyle(); // added to prevent unterminated
	}
	// ticker() will restore getComputedStyle() back to normal.
	return window.getComputedStyle.apply(this, arguments);
};

// This redundant flag is to support Safari which has trouble determining
// function object equality during an animation.
var isGetComputedStylePatched = false;
var originalGetComputedStyle = window.getComputedStyle;
if (verboseSafariGetComputedStyle) console.log("??? top originalGetComputedStyle:%s;",originalGetComputedStyle);
var ensureRetickBeforeGetComputedStyle = function() {
	if (verboseSafariGetComputedStyle) console.log("??? ensureRetick isPatched:%s; original:%s;",isGetComputedStylePatched,originalGetComputedStyle);
	if (!isGetComputedStylePatched) {
		Object.defineProperty(window, 'getComputedStyle', configureDescriptor({
			value: retickThenGetComputedStyle
		}));
		isGetComputedStylePatched = true;
	}
};

var ensureOriginalGetComputedStyle = function() {
	if (verboseSafariGetComputedStyle) console.log("??? ensureOriginal isPatched:%s; original:%s;",isGetComputedStylePatched,originalGetComputedStyle);
	if (isGetComputedStylePatched) {
		Object.defineProperty(window, 'getComputedStyle', configureDescriptor({
			value: originalGetComputedStyle
		}));
		isGetComputedStylePatched = false;
	}
};

// Changing the inline style of an element under animation may require the
// animation to be recomputed ontop of the new inline style if
// getComputedStyle() is called inbetween setting the style and the next
// animation frame.
// We modify getComputedStyle() to re-evaluate the animations only if it is
// called instead of re-evaluating them here potentially unnecessarily.
var animatedInlineStyleChanged = function() {
	//console.log("animatedInlineStyleChanged");
	maybeRestartAnimation();
	ensureRetickBeforeGetComputedStyle();
};


function ANIMATED_CSS_STYLE_DECLARATION() {}
/** @constructor */
var AnimatedCSSStyleDeclaration = function(element) { // CompositedPropertyMap.clear() causes lag at start of relativeFloat. More specifically AnimatedCSSStyleDeclaration._updateIndices
	ASSERT_ENABLED && assert(
			!(element.style instanceof AnimatedCSSStyleDeclaration),
			'Element must not already have an animated style attached.');

	// Stores the inline style of the element on its behalf while the
	// polyfill uses the element's inline style to simulate web animations.
	// This is needed to fake regular inline style CSSOM access on the element.
	this._surrogateElement = createDummyElement();
	this._style = element.style;
	this._length = 0;
	this._isAnimatedProperty = {};
	this._element = element;
	// Populate the surrogate element's inline style.
	copyInlineStyle(this._style, this._surrogateElement.style);
	this._updateIndices();
};

AnimatedCSSStyleDeclaration.prototype = {
	get cssText() {
		console.log("get cssText");
		return this._surrogateElement.style.cssText;
	},
	set cssText(text) {
		console.log("set cssText:%s;",text);
		var isAffectedProperty = {};
		for (var i = 0; i < this._surrogateElement.style.length; i++) {
			isAffectedProperty[this._surrogateElement.style[i]] = true;
		}
		this._surrogateElement.style.cssText = text;
		this._updateIndices();
		for (var i = 0; i < this._surrogateElement.style.length; i++) {
			isAffectedProperty[this._surrogateElement.style[i]] = true;
		}
		for (var property in isAffectedProperty) {
			if (!this._isAnimatedProperty[property]) {
				this._style.setProperty(property, this._surrogateElement.style.getPropertyValue(property));
			}
		}
		animatedInlineStyleChanged();
	},
	get length() {
		return this._surrogateElement.style.length;
	},
	get parentRule() {
		return this._style.parentRule;
	},
	get 'var'() {
		console.log("??? this._style.var:%s;",this._style.var);
		return this._style.var; 
	},
	_updateIndices: function() {
		while (this._length < this._surrogateElement.style.length) {
			Object.defineProperty(this, this._length, {
				configurable: true,
				enumerable: false,
				get: (function(index) {
					return function() {
						return this._surrogateElement.style[index];
					};
				})(this._length)
			});
			this._length++;
		}
		while (this._length > this._surrogateElement.style.length) {
			this._length--;
			Object.defineProperty(this, this._length, {
				configurable: true,
				enumerable: false,
				value: undefined
			});
		}
	},
	_restoreProperty: function(property) { // from _clearAnimatedProperty (below)
			this._style[property] = this._surrogateElement.style[property]; // INVALIDATES STYLE but gets forced in CompositedPropertyMap captureBaseValues
	},
	_clearAnimatedProperty: function(property) {
		this._restoreProperty(property);
		this._isAnimatedProperty[property] = false;
	},
	_setAnimatedProperty: function(property, value) { // called from setValue() from CompositedPropertyMap applyAnimatedValues
		this._style[property] = value; // INVALIDATES STYLE // sets element.style when animating
		this._isAnimatedProperty[property] = true;
	}
};

for (var method in cssStyleDeclarationMethodModifiesStyle) {
	AnimatedCSSStyleDeclaration.prototype[method] =
			(function(method, modifiesStyle) {
		return function() {
			var result = this._surrogateElement.style[method].apply(
					this._surrogateElement.style, arguments);
			if (modifiesStyle) {
				if (!this._isAnimatedProperty[arguments[0]]) {
					console.log("css style declaration not animated property, apply");
					
					this._style[method].apply(this._style, arguments);
				}
				this._updateIndices();
				animatedInlineStyleChanged();
			}
			return result;
		}
	})(method, cssStyleDeclarationMethodModifiesStyle[method]);
}

for (var property in document.documentElement.style) {
	if (cssStyleDeclarationAttribute[property] || property in cssStyleDeclarationMethodModifiesStyle) {
		continue;
	}
	(function(property) {
		Object.defineProperty(AnimatedCSSStyleDeclaration.prototype, property, configureDescriptor({
			get: function() {
				var value = this._surrogateElement.style[property];
				return value;
			},
			set: function(value) {
				if (verboseSafariGetComputedStyle) console.log("===> AnimatedCSSStyleDeclaration SET property:%s; value:%s; type:%s;",property,value,getType(property,value).toString());
				
				var previous = this._surrogateElement.style[property];
				var presentation = this._style[property];
				var zero = getType(property,value).zero().d;
				if (!zero && zero !== 0) zero = getType(property,value).zero();
				
				var animation = kxdxImplicitAnimation(property,this._element,value,previous,presentation,zero);
				if (animation) {
					this._isAnimatedProperty[property] = true; 
					var player = this._element.hyperPlayer();
					player._addAnimation(animation);
				} else {
					var player = this._element.hyperPlayer();
					var description = { // Create animation for every property change... does not happen if AnimatedCSSStyleDeclaration does not exist !!! // Not just a hack to fix Safari flicker. Ensure style changes happen at animation frame tick, using existing methods.
						type:property,
						duration:0
					};
					animation = kxdxAnimationFromDescription(description);
					player._addAnimation(animation);
				}
				if (verboseSafariGetComputedStyle) console.log("animation:%s;",animation);
				this._surrogateElement.style[property] = value;
				this._updateIndices();
				// if (!this._isAnimatedProperty[property]) this._style[property] = value; // ORIGINAL
				
				animatedInlineStyleChanged();
			}
		}));
	})(property);
}

// This function is a fallback for when we can't replace an element's style with
// AnimatatedCSSStyleDeclaration and must patch the existing style to behave
// in a similar way.
// Only the methods listed in cssStyleDeclarationMethodModifiesStyle will
// be patched to behave in the same manner as a native implementation,
// getter properties like style.left or style[0] will be tainted by the
// polyfill's animation engine.
var patchInlineStyleForAnimation = function(style) {
	console.log("????? patchInlineStyleForAnimation style:%s;",style);
	var surrogateElement = document.createElement('div');
	copyInlineStyle(style, surrogateElement.style);
	var isAnimatedProperty = {};
	for (var method in cssStyleDeclarationMethodModifiesStyle) {
		if (!(method in style)) {
			continue;
		}
		
		Object.defineProperty(style, method, configureDescriptor({
			value: (function(method, originalMethod, modifiesStyle) {
				return function() {
					var result = surrogateElement.style[method].apply(
							surrogateElement.style, arguments);
							if (verboseSafariGetComputedStyle) console.log("patchInlineStyleForAnimation result:%s;",result);
					if (modifiesStyle) {
						if (!isAnimatedProperty[arguments[0]]) {
							originalMethod.apply(style, arguments);
						}
						animatedInlineStyleChanged(); //retick
					}
					return result;
				}
			})(method, style[method], cssStyleDeclarationMethodModifiesStyle[method])
		}));
	}

	style._clearAnimatedProperty = function(property) {
		this[property] = surrogateElement.style[property];
		isAnimatedProperty[property] = false;
	};

	style._setAnimatedProperty = function(property, value) {
		if (verboseSafariGetComputedStyle) console.log("????? patched style._setAnimatedProperty:%s; value:%s;",property,value);
		this[property] = value;
		isAnimatedProperty[property] = true;
	};
};





var hyperAnimationProperties = function() {

	var animProperties;
	if (!isCustomObject(this)) {
		animProperties = this._animProperties;
		if (animProperties === undefined) { // Compositor
			animProperties = new CompositedPropertyMap(this,"style"); // 2nd argument "style" not yet needed
			this._animProperties = animProperties; // Compositor
		}
	} else {
		var animProperties = this.state.hyperAnimationProperties;
		if (animProperties === undefined) { // Compositor
			animProperties = new CompositedStateMap(this,"state");
			this.setState({ hyperAnimationProperties : animProperties });
		}
	}
	return animProperties;
}

function COMPOSITOR() {}
/** @constructor */
var Compositor = function() {

};



Compositor.prototype = {
	setAnimatedValue: function(target, property, compositableValue) { // called from BasicEffect _sample from Animation _sample from ticker as it loops through each sorted animation
		if (target !== null) {
			var compositedPropertyMap = hyperAnimationProperties.apply(target);
			//if (verboseSafariGetComputedStyle) console.log("!!! compositor setAnimatedValue:%s; property:%s; target:%s;",JSON.stringify(compositableValue),property,target);
			compositedPropertyMap.addValue(property, compositableValue);
		}
	},
	applyAnimatedValues: function(targets) { // called from ticker // Three separate loops needed to minimize layout thrashing
		for (var i = 0; i < targets.length; i++) {
			var compositedPropertyMap;
			var target = targets[i];
			if (!isCustomObject(target)) compositedPropertyMap = target._animProperties;
			else compositedPropertyMap = target._hyperAnimationProperties();
			if (compositedPropertyMap) compositedPropertyMap.clear();
		}
		for (var i = 0; i < targets.length; i++) {
			var compositedPropertyMap;
			var target = targets[i];
			if (!isCustomObject(target)) compositedPropertyMap = target._animProperties;
			else compositedPropertyMap = target._hyperAnimationProperties();
			if (compositedPropertyMap) compositedPropertyMap.captureBaseValues(); // This could be optimized if you could ignore className & stylesheet changes.
		}
		for (var i = 0; i < targets.length; i++) {
			var compositedPropertyMap;
			var target = targets[i];
			if (!isCustomObject(target)) compositedPropertyMap = target._animProperties;
			else compositedPropertyMap = target._hyperAnimationProperties();
			if (compositedPropertyMap) compositedPropertyMap.applyAnimatedValues();
		}
	}
};



var ensureTargetInitialized = function(property, target) {
	if (verboseSafariGetComputedStyle) console.log("===> ensureTargetInitialized:%s; property:%s;",target,property);
	if (propertyIsSVGAttrib(property, target)) {
		ensureTargetSVGInitialized(property, target);
	} else {
		ensureTargetCSSInitialized(target);
	}
};

var ensureTargetSVGInitialized = function(property, target) {
	if (!isDefinedAndNotNull(target._actuals)) {
		target._actuals = {};
		target._bases = {};
		target.actuals = {};
		target._getAttribute = target.getAttribute;
		target._setAttribute = target.setAttribute;
		target.getAttribute = function(name) {
			if (isDefinedAndNotNull(target._bases[name])) {
				return target._bases[name];
			}
			return target._getAttribute(name);
		};
		target.setAttribute = function(name, value) {
			if (isDefinedAndNotNull(target._actuals[name])) {
				target._bases[name] = value;
			} else {
				target._setAttribute(name, value);
			}
		};
	}
	if (!isDefinedAndNotNull(target._actuals[property])) {
		var baseVal = target.getAttribute(property);
		target._actuals[property] = 0;
		target._bases[property] = baseVal;

		Object.defineProperty(target.actuals, property, configureDescriptor({
			set: function(value) {
				if (value === null) {
					target._actuals[property] = target._bases[property];
					target._setAttribute(property, target._bases[property]);
				} else {
					target._actuals[property] = value;
					target._setAttribute(property, value);
				}
			},
			get: function() {
				return target._actuals[property];
			}
		}));
	}
};

var ensureTargetCSSInitialized = function(target) {
	if (verboseSafariGetComputedStyle) console.log("===> ensureTargetCSSInitialized:%s;",target);
	if (target.style._webAnimationsStyleInitialized) {
		return;
	}
	try {
		var animatedStyle = new AnimatedCSSStyleDeclaration(target);
		if (verboseSafariGetComputedStyle) console.log("===> ensureTargetCSSInitialized new:%s;",animatedStyle);
		Object.defineProperty(target, 'style', configureDescriptor({
			get: function() { 
				return animatedStyle;
			}
		}));
	} catch (error) {
		patchInlineStyleForAnimation(target.style);
	}
	target.style._webAnimationsStyleInitialized = true;
};



var rafScheduled = false;

var compositor = new Compositor();

var usePerformanceTiming =
		typeof window.performance === 'object' &&
		typeof window.performance.timing === 'object' &&
		typeof window.performance.now === 'function';

// Don't use a local named requestAnimationFrame, to avoid potential problems with hoisting.
var nativeRaf = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame;
var raf;
if (nativeRaf) {
	raf = function(callback) {
		nativeRaf(function() {
			callback(clockMillis());
		});
	};
} else {
	raf = function(callback) {
		setTimeout(function() {
			callback(clockMillis());
		}, 1000 / 60);
	};
}

var clockMillis = function() {
	return usePerformanceTiming ? window.performance.now() : Date.now();
};
// Set up the zero times for document time. Document time is relative to the
// document load event.
var documentTimeZeroAsRafTime;
var documentTimeZeroAsClockTime;
var load;
if (usePerformanceTiming) {
	load = function() {
		// RAF time is relative to the navigationStart event.
		documentTimeZeroAsRafTime =
				window.performance.timing.loadEventStart -
				window.performance.timing.navigationStart;
		// performance.now() uses the same origin as RAF time.
		documentTimeZeroAsClockTime = documentTimeZeroAsRafTime;
	};
} else {
	// The best approximation we have for the relevant clock and RAF times is to
	// listen to the load event.
	load = function() {
		raf(function(rafTime) {
			documentTimeZeroAsRafTime = rafTime;
		});
		documentTimeZeroAsClockTime = Date.now();
	};
}
// Start timing when load event fires or if this script is processed when
// document loading is already complete.
if (document.readyState === 'complete') {
	// When performance timing is unavailable and this script is loaded
	// dynamically, document zero time is incorrect.
	// Warn the user in this case.
	if (!usePerformanceTiming) {
		console.warn(
				'Web animations can\'t discover document zero time when ' +
				'asynchronously loaded in the absence of performance timing.');
	}
	load();
} else {
	addEventListener('load', function() {
		load();
		if (usePerformanceTiming) {
			// We use setTimeout() to clear cachedClockTimeMillis at the end of a
			// frame, but this will not run until after other load handlers. We need
			// those handlers to pick up the new value of clockMillis(), so we must
			// clear the cached value.
			cachedClockTimeMillis = undefined;
		}
	});
}

// A cached document time for use during the current callstack.
var cachedClockTimeMillis;
// Calculates one time relative to another, returning null if the zero time is
// undefined.
var relativeTime = function(time, zeroTime) {
	return isDefined(zeroTime) ? time - zeroTime : null;
};

var lastClockTimeMillis;

var cachedClockTime = function() {
	// Cache a document time for the remainder of this callstack.
	if (!isDefined(cachedClockTimeMillis)) {
		cachedClockTimeMillis = clockMillis();
		lastClockTimeMillis = cachedClockTimeMillis;
		setTimeout(function() { cachedClockTimeMillis = undefined; }, 0);
	}
	return cachedClockTimeMillis / 1000;
};


// These functions should be called in every stack that could possibly modify
// the effect results that have already been calculated for the current tick.
var modifyCurrentAnimationStateDepth = 0;
var enterModifyCurrentAnimationState = function() {
	modifyCurrentAnimationStateDepth++;
};
var exitModifyCurrentAnimationState = function(shouldRepeat) {
	modifyCurrentAnimationStateDepth--;
	// shouldRepeat is set false when we know we can't possibly affect the current
	// state (eg. a TimedItem which is not attached to a player). We track the
	// depth of recursive calls trigger just one repeat per entry. Only the value
	// of shouldRepeat from the outermost call is considered, this allows certain
	// locatations (eg. constructors) to override nested calls that would
	// otherwise set shouldRepeat unconditionally.
	if (modifyCurrentAnimationStateDepth === 0 && shouldRepeat) {
		repeatLastTick();
	}
};

var repeatLastTick = function() {
	if (isDefined(lastTickTime)) {
		ticker(lastTickTime, true);
	} else {
		console.log("do not repeat last tick?");
	}
};


var animationSortFunction = function(a, b) {
	var A = a._hyperIndex, B = b._hyperIndex;
	if (A === null || A === undefined) A = 0;
	if (B === null || B === undefined) B = 0;
	var result = A - B;
	
	if (result == 0) result = a._startTime - b._startTime;
	return result !== 0 ? result : a._sequenceNumber - b.sequenceNumber;
};





var debugTicker = false;

function TICKER() {}


var tickPlayers = function(playaz) {
	
	var finished = true;
	var paused = true;
	var animations = [];
	var targets = []; 
	var finishedPlayaz = [];
	var everything = [];
	
	var playazLength = playaz.length;
	playaz.forEach(function(playa,playaIndex) {
		
		playa._hasTicked = true;
		playa._update();
		
		var playDirectionForwards = (playa.playbackRate > 0);
		var animations = playa.animations;
		
		var finishedAnimations = [];
		animations.forEach(function(animation) {
			finished = finished && !animation._hasFutureAnimation(playDirectionForwards);
			
			if (!animation._hasFutureEffect()) {
				finishedAnimations.push(animation);
			} else if (animation._isActive()) {
				animation._sample(playa.target);
			}
		});
		
		var finishedIndex = finishedAnimations.length;
		var animationIndex = animations.length;
		while (finishedIndex && animationIndex--) {
			var finishedAnimation = finishedAnimations[finishedIndex - 1];
			if (animations[animationIndex] == finishedAnimation) {
				playa._removeAnimation(finishedAnimation);
				finishedIndex--;
			}
		}
		
		if (!playa._animations.length) finishedPlayaz.push(playa);
		everything.push(playa.target);
	});
	
	paused = false; // temporary !!! TODO: implement this
	// Generate events
	playaz.forEach(function(playa) {
		playa._generateEvents();
	});
	
	compositor.applyAnimatedValues(everything); 
	return {finishedPlayers:finishedPlayaz, paused:paused, finished:finished};

};


function transact() {
	// Clear any modifications to getComputedStyle.
	ensureOriginalGetComputedStyle(); // remove retick // Adding retick call to getComputedStyle is probably unnecessary trickery

	var paused = true;
	var finished = true;
	var finishedPlayers = [];
	
	var returnState = tickPlayers(document.timeline._statePlayers,true);
	if (returnState.finishedPlayers) finishedPlayers = finishedPlayers.concat(returnState.finishedPlayers);
	paused = paused && returnState.paused;
	finished = finished && returnState.finished;
	
	var returnStyle = tickPlayers(document.timeline._stylePlayers,false);
	if (returnStyle.finishedPlayers) finishedPlayers = finishedPlayers.concat(returnStyle.finishedPlayers);
	paused = paused && returnStyle.paused;
	finished = finished && returnStyle.finished;
	
	playersAreSorted = true;
	// Remove finished players. Warning: _deregisterFromTimeline modifies
	// the PLAYER list. It should not be called from within a PLAYERS.forEach
	// loop directly.
	finishedPlayers.forEach(function(player) {
		player._deregisterFromTimeline();
		playersAreSorted = false;
	});
	
	return finished;
}

var lastTickTime;
var ticker = function(rafTime, isRepeat) {
	// Don't tick till the page is loaded....
	if (!isDefined(documentTimeZeroAsRafTime)) {
		console.log("wait");
		raf(ticker);
		return;
	}
	
	if (!isRepeat) {
		if (rafTime < lastClockTimeMillis) {
			rafTime = lastClockTimeMillis;
		}
		lastTickTime = rafTime;
		cachedClockTimeMillis = rafTime;
	}
	
	var paused = false; // TODO: implement
	var finished = transact();
	
	if (!isRepeat) {
		if (finished || paused) {
			rafScheduled = false;
		} else {
			raf(ticker);
		}
		cachedClockTimeMillis = undefined;
	}
};

// Multiplication where zero multiplied by any value (including infinity)
// gives zero.
var multiplyZeroGivesZero = function(a, b) {
	return (a === 0 || b === 0) ? 0 : a * b;
};

var maybeRestartAnimation = function() {
	if (rafScheduled) { // original
			return;
	}
	raf(ticker);
	rafScheduled = true;
};

var HYPERMATIC_TIMELINE = new Timeline(PRIVATE);
// attempt to override native implementation
try {
	Object.defineProperty(document, 'timeline', {
		configurable: true,
		get: function() { return HYPERMATIC_TIMELINE }
	});
} catch (e) { }
// maintain support for Safari
try {
	document.timeline = HYPERMATIC_TIMELINE;
} catch (e) { }



var kxdxAnimationFromDescription = function(description,depth) {
	var animation = null;
	if (description) {
		//if (description instanceof TimedItem) {
		if (description instanceof HyperAnimation) {
			animation = new HyperAnimation(description.settings);
		} else if (Array.isArray(description)) {
			if (!isDefinedAndNotNull(depth)) depth = 0
			var array = description;
			var length = array.length;
			var children = [];
			var parent = null;
			var startTime = HYPERMATIC_TIMELINE.currentTime === null ? 0 :HYPERMATIC_TIMELINE.currentTime;
			for (var i=0; i<length; i++) {
				var child = kxdxAnimationFromDescription(array[0], depth+1)
				if (child !== null) {
					children.push(child);
					if (child._startTime !== null) startTime = Math.min(startTime,child._startTime);
				}
			}
			if (children.length == 1) animation = children[0];
			else if (children.length && depth == 0) { // chain is default for nested array syntax but group is default if children without type?
				var description = {
					type:"chain",
					children:children,
					startTime : startTime,
				}
				animation = new HyperAnimationChain(description);
			} else if (children.length && depth == 1) {
				var description = {
					type:"group",
					children:children,
					startTime : startTime,
				}
				animation = new HyperAnimationGroup(description);
			}
		} else {
			if (description.type === "group" || (description.type !== "chain" && Array.isArray(description.children))) { // chain is default for nested array syntax but group is default if children without type?
				animation = new HyperAnimationGroup(description);
			} else if (description.type === "chain" || Array.isArray(description.children)) {
				animation = new HyperAnimationChain(description);
			} else {
				animation = new HyperAnimation(description);
			}
		}
	}
	return animation;
}


var kxdxImplicitAnimation = function (property,target,value,previous,presentation,zero) { // attempt to combine code from AnimatedCSSStyleDeclaration and setHyperState has not worked out well. Must batch together adding animations for setHyperState, can't add animations here.
	var implicitAnimation; // TODO: must enforce HyperAnimation not WebAnimation !!!!!
	//console.log("kxdxImplicit property:%s; target:%s; value:%s; previous:%s; presentation:%s; zero:%s;",property,target,value,previous,presentation,zero);
	//kxdxImplicit property:webkitTransform; target:div#orange; value:translate3d(200px,0px,0) scale(1) rotate(0deg); previous:; presentation:; zero:;
	var unprefixedProperty = property;
	if (property === features.transformProperty) unprefixedProperty = "transform";
	if (!previous && previous !==0) previous = zero;
	if (!presentation && presentation !== 0) presentation = previous;
				
	if (isCustomObject(target)) { // React component is own delegate, maybe reconsider
		if (isFunction(target.hyperAnimationForKey)) implicitAnimation = target.hyperAnimationForKey(unprefixedProperty,target,value,previous,presentation,zero);
	} else if (target.hyperAnimationDelegate() && isFunction(target.hyperAnimationDelegate().hyperAnimationForKey)) {
		implicitAnimation = target.hyperAnimationDelegate().hyperAnimationForKey(unprefixedProperty,target,value,previous,presentation,zero);
	}
	if (!implicitAnimation && implicitAnimation !== false) {
		if (isCustomObject(target)) {
			// TODO: React component hyperDefaultAnimations. Seems redundant if component is its own delegate.
		} else if (target.hyperDefaultAnimations() && target.hyperDefaultAnimations()[unprefixedProperty]) {
			implicitAnimation = target.hyperDefaultAnimations()[unprefixedProperty];
		}
	}
	if (implicitAnimation) {
		// TODO: groups ?
		var settings = null;
		if (implicitAnimation instanceof TimedItem) settings = implicitAnimation.settings;
		else settings = implicitAnimation; // allow dict or animation for now
		settings = shallowObjectCopy(settings);
		var ink = (settings.ink === "absolute" ? settings.ink :	"relative");
		
		if (implicitAnimation instanceof TimingGroup) {
			// TODO: maybe loop through animations and supply from and to value if key is the animated property
			// May not make sense for sequential chains, but does for parallel groups
		} else {
			if (!settings.type) settings.type = property; // Maybe you shouldn't do this if there are settings.frames
			if (!settings.to) settings.to = value; // Maybe you shouldn't do this if there are settings.frames
			if (!settings.from) { // Maybe you shouldn't do this if there are settings.frames
				var implicit = settings.implicit;
				if (implicit === "presentation" || (implicit !== "model" && implicit !== "blend" && implicit !== "none" && ink === "absolute") ) { // implict is default if ink is absolute
					settings.from = presentation;			
				} else if (implicit !== "blend") settings.from = previous;
			}
		}
		implicitAnimation = kxdxAnimationFromDescription(settings);
		//console.log("implicitAnimation:%s;",JSON.stringify(implicitAnimation.settings));
		// implicitAnimation:{"duration":5,"type":"webkitTransform","to":"translate3d(200px,0px,0) scale(1) rotate(0deg)","from":"","fill":"backwards"};
		var naming = settings.naming;
		//if (naming == "none") implicitAnimation._hyperKey = property;
		if (naming === "exact") implicitAnimation._hyperKey = property;
		else if (naming === "increment") implicitAnimation._hyperKey = property;
		else if (ink === "absolute" && naming !== "none") implicitAnimation._hyperKey = property;
		
		return implicitAnimation;
	}
	return null;
}

function HYPERMATIC() {}
function hypermatic(dict, key) {
	if (!isCustomObject(this)) ensureTargetCSSInitialized(this);
	
	var animation = kxdxAnimationFromDescription(dict);
	
	if (animation instanceof TimedItem) {
		var player = this.hyperPlayer();
		player._addAnimation(animation,key);
		//return animation; // Do not return an animation
	}
}
window.Element.prototype.hypermatic = hypermatic;
window.Element.prototype.hyperAnimate = hypermatic;
window.Element.prototype.hyperStyle = hypermatic;
window.Element.prototype.hyperAnimateStyle = hypermatic;

window.Element.prototype.hyperPlayer = function() {
	var player = this._hyperPlayer;
	if (player === undefined) {
		player = new Player(PRIVATE, HYPERMATIC_TIMELINE, this);
		this._hyperPlayer = player;
	}
	return player;
}
	

window.Element.prototype.hyperDefaultAnimations = function() {
	var animations = this._hyperDefaultAnimations;
	if (!animations) return {};
	return animations;
}
window.Element.prototype.setHyperDefaultAnimations = function(animations) {
	this._hyperDefaultAnimations = animations;
	ensureTargetCSSInitialized(this); 
}
window.Element.prototype.hyperAnimationDelegate = function() {
	// this should be a property
	return this._hyperAnimationDelegate;
}
window.Element.prototype.setHyperAnimationDelegate = function(delegate) { 
	// this should be a property
	if (isFunction(delegate.hyperAnimationForKey)) {
		this._hyperAnimationDelegate = delegate;
		ensureTargetCSSInitialized(this); 
	} else {
		console.warn("must implement hyperAnimationForKey");
	}
}
/*
window.Element.prototype.hyperAnimator = function() {
	return this._hyperAnimator;
}
window.Element.prototype.setHyperAnimator = function(animator) { 
	if (isFunction(animator)) {
		this._hyperAnimator = animator;
		ensureTargetCSSInitialized(this); 
	} else {
		console.warn("must implement hyperAnimationForKey");
	}
}
*/
var hyperAnimations = function() {
	return this.hyperPlayer()._animations.slice(0);
}	
var hyperStyleAnimations = function() {
	return this.hyperPlayer()._animations.slice(0);
};
var hyperStateAnimations = function() {
	return this.hyperPlayer()._animations.slice(0);
};

window.Element.prototype.hyperAnimations = hyperAnimations;
window.Element.prototype.hyperStyleAnimations = hyperAnimations;

window.Element.prototype.removeAllHyperAnimations = function() {

}

var hyperAnimationNamed = function(key) {
	return this.hyperPlayer()._animationNamed(key);
}
window.Element.prototype.hyperAnimationNamed = hyperAnimationNamed;

window.Element.prototype.hyperRemoveAnimationNamed = function(key) {
	return this.hyperPlayer()._removeAnimationNamed(key);
}
//window.Element.prototype.hyperGetAnimationById = hyperAnimationNamed;

window.HyperAnimation = HyperAnimation;
window.HyperAnimationGroup = HyperAnimationGroup;
window.HyperAnimationChain = HyperAnimationChain;

/*
//window.Animation = HyperAnimation;
//window.AnimationEffect = AnimationEffect;
//window.KeyframeEffect = KeyframeEffect;
//window.BasicEffect = BasicEffect;
//window.MediaReference = MediaReference;
//window.ParGroup = ParGroup;

window.HyperMotionPathEffect = HyperMotionPathEffect;

window.Player = Player;
window.PseudoElementReference = PseudoElementReference;
//window.SeqGroup = SeqGroup;

window.TimedItem = TimedItem;
window.TimedItemList = TimedItemList;
window.Timing = Timing;
window.Timeline = Timeline;
window.TimingEvent = TimingEvent;
window.TimingGroup = TimingGroup;
*/

var mixin = { // return value is combination Hypermatic namespace and React mixin
	// React methods are exposed on Hypermatic
	// Hypermatic methods are exposed on the React mixin.
	// undefined behavior if you use one meant for the other.
	// TODO: figure out better solution or at least document which belongs to what
	// TODO: also clean up lots of unused functions, here and on Element.
	// TODO: everything prefixed hyper
	
	flush: transact,
	
	componentWillMount: function() {
		this._hyperAnimationProperties(); // create hyperAnimationProperties object now because it calls setState, which cannot happen during render
	},
	
	animation : HyperAnimation,
	styleAnimation : HyperAnimation, // var anim = new Hypermatic.styleAnimation({ ... }); // var anim = new this.styleAnimation({ ... });
	stateAnimation : HyperAnimation, // var anim = new Hypermatic.styleAnimation({ ... }); // var anim = new this.styleAnimation({ ... });
	
	animateStyle : function() {
		var element = React.findDOMNode(this);
		if (element) hypermatic.apply(element,arguments); // React !!!
	},
	animateState : function() {
	
	},
	hyperAnimate : function() {
		hypermatic.apply(this,arguments); // React !!!
	},
	hyperAnimateState : function() {
		hypermatic.apply(this,arguments); // React !!!
	},
	hyperPlayer: function() {
		var player = this.state.hyperPlayer;
		if (player === undefined) {
			player = new Player(PRIVATE, HYPERMATIC_TIMELINE, this);
		 	this.setState({ hyperPlayer: player });
		}
		return player;
	},
	_hyperAnimationProperties : function() {
		return hyperAnimationProperties.apply(this);
	},
	
	hyperState : function() { // cannot get hyperState in render because it calls setState when creating hyperAnimationProperties
	
		// if you directly animate state then hyperState is the model value
		// but setHyperState sets the model value and triggers animations
		
		// unanimatedState and setAnimatedState
		//return this._hyperAnimationProperties().animatedState;
		//return this._hyperAnimationProperties().baseValues;
		
		var state = this.state;
		var keys = Object.keys(state);
		var hyper = {};
		var i = keys.length;
		var baseValues = this._hyperAnimationProperties().baseValues;
		while (i--) {
			var key = keys[i];
			// sample animations here
			// return presentation value
			var modelValue = baseValues[key];
			if (modelValue) modelValue = modelValue.d;
			if (!modelValue) modelValue = state[key];
			if (isArray(modelValue)) hyper[key] = modelValue.slice(0); // copy array so it can't be mutated
			else hyper[key] = modelValue;
		}
		return hyper;
		
	},
	setHyperState : function(newStateOrFunction, notYetImplementedCallbackFunction) { // may also pass a function instead of newState, and there is an optional second argument for a callback function
		var newState = newStateOrFunction; // TODO: can be a function !!! 
		var nonAnimatedState = {};
		var animations = [];
		if (this.hyperAnimationForKey && isFunction(this.hyperAnimationForKey)) {
			var keys = Object.keys(newState);
			var i = keys.length;
			while (i--) {
				var key = keys[i];
				var to = newState[key];
				var baseValue = this._hyperAnimationProperties().baseValues[key];
				var previous = baseValue;
				// baseValue does not get set if you explicitly animate.
				// CompositedStateMap captureBaseValues does nothing.
				if (baseValue && baseValue.d) previous = baseValue.d; 
				if (!previous && previous !== 0) previous = this.state[key]; // if you haven't animated yet, there is no stored baseValue so pull from state
				var zero = getType(key,to).zero().d;
				if (!zero && zero !== 0) zero = getType(key,to).zero();
				if (!previous && previous !== 0) previous = zero;
				var presentation = this.state[key];
				if (!presentation && presentation !== 0) presentation = previous;
				var typeObject = getType(key,newState[key]);
				var rawValue = typeObject.fromCssValue(newState[key]);
				var animation = kxdxImplicitAnimation(key,this,newState[key],previous,presentation,zero);
				if (animation) {
					this._hyperAnimationProperties().baseValues[key] = rawValue; // baseValue does not get set if you explicitly animate.
					animations.push(animation);
				} else {
					nonAnimatedState[key] = newState[key];
				}
			}
		} else nonAnimatedState = newState;
		if (animations.length) {
			var player = this.hyperPlayer();
			animations.forEach(function(animation) {
				player._addAnimation(animation);
			});
		}
		if (Object.keys(nonAnimatedState).length) this.setState(nonAnimatedState);
	},
	hyperStyleAnimations : function() {
		var element = React.findDOMNode(this);
		return hyperStyleAnimations.apply(element,arguments);
	},
	hyperStateAnimations : function() {
		return hyperStateAnimations.apply(this,arguments);
	},
	hyperAnimations : function() {
		return hyperStateAnimations.apply(this,arguments);
	},
	hyperAnimationNamed : function(key) {
		return hyperAnimationNamed.apply(this,arguments);
	},
	hyperDefaultAnimations : function() {
		var animations = this.state.hyperDefaultAnimations;
		if (!animations) {
			animations = {};
		}
		return defaultAnimations;
	},
	setHyperDefaultAnimations : function(animations) {
		this.setState({ hyperDefaultAnimations : animations });
	},
}
return mixin;
})();