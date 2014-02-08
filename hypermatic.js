//
// hypermatic.js
// https://github.com/KevinDoughty/Hypermatic
//
// Copyright (c) 2013 Kevin Doughty
// Licensed under the MIT license.
//

(function ( $ ) {
'use strict';
	
	if (!document.timeline) console.log('Hypermatic jQuery plugin requires web-animations shim or native browser implementation.');
	
	var perfect = 'cubic-bezier(0.5, 0.0, 0.5, 1.0)';
	var defaultSteps = 50;
	var hypermaticUnderlyingGroup = null;
	
	function scientificToDecimal(n) {
		return Number(n).toFixed(4);
	}
	
	function isNumber(w) {
		return jQuery.isNumeric(w); // !isNaN(parseFloat(w)) && isFinite(w);
	}
	
	function isArray(w) {
		return jQuery.isArray(w); // Object.prototype.toString.call(w) === '[object Array]';
	}
	
	function isString(w) {
		return jQuery.type(w) === 'string'; // (typeof w == 'string' || w instanceof String);
	}
	
	function isElement(w) {
		return (w instanceof HTMLElement);
	}
	
	function isFunction(w) {
		return jQuery.isFunction(w); // w && {}.toString.call(w) === '[object Function]'; // underscore
	}
	
	function copyingSelectionArray(selection) {
		var array = [];
		selection.each( function(index,element) {
			array[array.length] = element;
		});
		return array;
	}
	
	function copyingInputArray(input) {
		var array = [];
		if (isString(input)) {
			$(input).each( function(index,element) {
				array[array.length] = element;
			});
		} else if (isElement(input)) array = [input];
		return array;
	}
	
	function copyingEqualizeLength(less,more) {
		var index = 0;
		while (less.length < more.length) {
			less[less.length] = more[index];
			if (++index >= more.length) index = 0;
		}
	}
	
	function copy(oldElement,newElement,property) {
		var oldAnimations = oldElement.getCurrentAnimations();
		var length = oldAnimations.length
		for (var i=0; i<length; i++) {
			var oldAnimation = oldAnimations[i];
			var oldFrames = oldAnimation.effect.getFrames();
			var oldFirst = oldFrames[0];
			if (property === null || property === undefined || (oldFirst[property] !== null && oldFirst[property] !== undefined)) {
				var oldLast = oldFrames[oldFrames.length-1];
				var newEffect = oldAnimation.effect.clone();
				var oldTiming = oldAnimation.specified._dict; // !!!
				if (oldTiming === null || oldTiming === undefined) console.log('oldAnimation.specified._dict has changed');
				if (oldAnimation._player === null || oldAnimation._player === undefined) console.log('oldAnimation._player has changed');
				var newTiming = JSON.parse(JSON.stringify(oldTiming));
				newTiming.delay = ((oldAnimation._player.startTime + oldTiming.delay) - document.timeline.currentTime); // !!!
				newElement.animate(newEffect,newTiming);
			}
		}
	}
	
	function copyArrays(fromArray,toArray,property) {
		if (fromArray.length && toArray.length) {
			copyingEqualizeLength(fromArray,toArray);
			copyingEqualizeLength(toArray,fromArray);
			for (var length = fromArray.length, index = 0; index < length; index++) {
				copy(fromArray[index],toArray[index],property);
			}
		}
	}
	
	function underlyingAssign(element,type,newAnim) {
 		if (newAnim === null) {
 			var count = $(element).data("hypermaticUnderlyingCount");
 			if (count === null || count === undefined || count === 1) count = 0;
 			else count--;
 			if (count > 0) {
 				$(element).data("hypermaticUnderlyingCount",count);
 				var list = $(element).data("hypermaticUnderlyingDict");
 				var oldAnim = list[type];
 				list[type] = null;
 				oldAnim.remove();
 			} else {
 				$(element).data("hypermaticUnderlyingCount",null);
 				$(element).data("hypermaticUnderlyingDict",null);
 			}
 		} else {
 			if (hypermaticUnderlyingGroup === null) {
				hypermaticUnderlyingGroup = new ParGroup([],{duration:0, fill:'both'});
				document.timeline.play(hypermaticUnderlyingGroup);
			}
			var list = $(element).data("hypermaticUnderlyingDict");
			if (list === null || list === undefined) {
				list = {};
				$(element).data("hypermaticUnderlyingDict",list);
			}
			var oldAnim = list[type];
			var count = $(element).data("hypermaticUnderlyingCount");
			if (oldAnim === null || oldAnim === undefined) count++;
			$(element).data("hypermaticUnderlyingCount",count);
			list[type] = newAnim;
			if (oldAnim !== null && oldAnim !== undefined) oldAnim.remove();
			hypermaticUnderlyingGroup.append(newAnim);
		}
 	}
 	
 	
	function underlying(element,dict,values) {
		if (document.timeline) {
			if (!values) values = dict.nu || dict.to || dict.values;
			if (values && !isArray(values)) values = values.call(element);
			if (values && isArray(values) && values.length) {
				var operation = dict.operation || 'replace'; // operation has a different name in hyperEffect
				var frames = hyperKeyframes(dict,values,values,true);
				var effect = new KeyframeEffect(frames, operation);
				var delay = document.timeline.currentTime;
				var timing = {duration:0, fill:"both", delay:delay};
				var anim = new Animation(element, effect, timing);
				underlyingAssign(element, dict.type, anim);
			} else underlyingAssign(element, dict.type, null);
		}
	}
	
	function hyperTiming(dict) {
 		var duration = dict.duration;
 		var easing = perfect;
 		if (dict.easing && typeof dict.easing != 'string') easing = 'linear';
 		else if (dict.easing) easing = dict.easing;
 		var delay = (dict.delay) ? dict.delay : 0;
 		if (dict.key) delay += document.timeline.currentTime;	
		return {duration:duration, easing:easing, fill:'backwards', delay:delay};
	}
	
	function hyperKeyframes(dict,old,nu,seams) {
		var frames = [], type = dict.type, unit = dict.unit, steps = dict.steps;
		var callback = null;
		if (dict.easing && typeof dict.easing != 'string') callback = dict.easing;
		if (!unit) unit = "";
		var isScale = (type.substr(0,5) == 'scale');
		var isTransform = (isScale || type.substr(0,6) == 'rotate' || type.substr(0,9) == 'translate' ||  type.substr(0,6) == 'matrix');
		var name = (isTransform) ? 'transform' : type;
		var divider = (isTransform) ? ", " : " ";
		if (steps === null || steps === undefined) steps = defaultSteps;
		if (!callback || steps < 3) steps = 2;
		for (var i=0;i<steps;i++) {
			var offset = scientificToDecimal( (1.0/(steps-1))*i ) * 1.0; // offset from 0 to 1
			var progress = 1.0 - offset;
			if (callback && i < steps) progress = 1 - callback.call(null,offset); // should I enforce 0 and 1 for first and last?
			frames[i] = {'offset':offset};
			frames[i][name] = (isTransform) ? type+'(' : '';
			var length = Math.min(old.length,nu.length);
			for (var j = 0; j<length; j++) {
				if (j > 0) frames[i][name] += divider;
				var string = null, a = old[j], b = nu[j];
				if (seams) string = scientificToDecimal(a+(progress*(b-a))) + unit;
				else if (isScale) string = scientificToDecimal(((progress * (a-b)) + b) / b) + unit;
				else string = scientificToDecimal((progress * (a-b))) + unit;
				frames[i][name] += string;
			}
			if (isTransform) frames[i][name] += ')';
		}
		return frames;
	}
	
	function hyperEffect(dict,old,nu,seams) {
		var frames = hyperKeyframes(dict,old,nu,seams);
		var compositing = "add";
		if (dict.add === false || dict.additive === false) compositing = "replace"; // wrong. should be dict.operation like in function underlying
		return new KeyframeEffect(frames,compositing);
	}
	
	function hyperAnimate(element,effect,timing) {
		var anim = new Animation(element, effect, timing);
		anim.onend = function() {
			if (!anim.parent) {
				if (anim._player === null || anim._player === undefined) console.log('theAnimation._player does not exist');
				else anim._player._deregisterFromTimeline();
			}
		};
		document.timeline.play(anim);
	}
	
	$.fn.hyperCopyFrom = function(input,property) {
		if (document.timeline) copyArrays(copyingInputArray(input),copyingSelectionArray(this),property);
		return this;
	}

	$.fn.hyperCopyTo = function(input,property) {
		if (document.timeline) copyArrays(copyingSelectionArray(this),copyingInputArray(input),property);
		return this;
	}
	
	$.fn.hypermatic = function(dict) {	
		if (document.timeline && dict.type && (dict.values || dict.nu || dict.to)) {
			this.each( function(index,element) {
				var nu = dict.nu;
				if (!nu && nu !== 0) nu = dict.to;
				var old = dict.old;
				if (!old && old !== 0) old = dict.from;
				if (!nu && nu !== 0 && !old && old !== 0 && dict.values) {
					old = [];
					nu = [];
					var length = Math.floor(dict.values.length/2.0);
					for (var i=0; i<length; i++) {
						old[i] = dict.values[i*2];
						nu[i] = dict.values[(i*2)+1];
					}
				}
				if (nu || nu === 0) {
					if (isFunction(nu)) nu = nu.call(element);
					if (!isArray(nu)) nu = [nu];
					var seams = dict.from || dict.from === 0 || dict.to || dict.to === 0;
					if (!old && old !== 0) {
						var list = $(element).data("hypermaticValueDict");
						if (!list) {
							 list = {};
							 $(element).data("hypermaticValueDict",list);
						} else old = list[dict.type];
						list[dict.type] = nu;
					}
					if (dict.duration > 0) {
						if (old || old === 0) {
							if (isFunction(old)) old = old.call(element);
							if (!isArray(old)) old = [old];
							var i = Math.min(old.length,nu.length);
							while (i--) {
								if (old[i] - nu[i]) {
									var effect = hyperEffect(dict,old,nu,seams);
									var timing = hyperTiming(dict);
									hyperAnimate(element,effect,timing);
									break;
								}
							}
						}
					}
				}
				if (dict.fill === true) underlying(element,dict,nu);
				else if (isFunction(dict.fill)) dict.fill.call(element);
			});
		}
		return this;
	};
 	
}( jQuery ));