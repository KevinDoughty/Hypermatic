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
	
	function isNumber(n) {
		n = scientificToDecimal(n);
		return !isNaN(parseFloat(n)) && isFinite(n);
	}
 
	function isArray(o) {
		return Object.prototype.toString.call(o) === '[object Array]';
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
		if (typeof input == 'string') {
			$(input).each( function(index,element) {
				array[array.length] = element;
			});
		} else if (input instanceof HTMLElement) array = [input];
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
	
	function underlyingKeyframes(dict) {
		var frames = [], array = dict.values, type = dict.type, unit = dict.unit, steps = dict.steps, callback = dict.progress;
		if (array && !isArray(array)) array = dict.values.call(this);
		if (array && isArray(array) && array.length) {
			if (!unit) unit = "";
			var isScale = (type.substr(0,5) == 'scale');
			var isRotate = (type.substr(0,6) == 'rotate');
			var isTranslate = (type.substr(0,9) == 'translate');
			var isMatrix = (type.substr(0,6) == 'matrix');
			var isTransform = (isScale || isRotate || isTranslate || isMatrix);
			var name = (isTransform) ? 'transform' : type;
			var divider = (isTransform) ? ", " : " ";
			for (var i=0;i<2;i++) {
				frames[i] = {'offset':i};
				frames[i][name] = (isTransform) ? type+'(' : '';
				for (var j = 0; j<array.length; j++) {
					if (j > 0) frames[i][name] += divider;
					if (isNumber(array[j])) frames[i][name] += scientificToDecimal(array[j])+unit;
					else frames[i][name] += array[j]+unit;
				}
				if (isTransform) frames[i][name] += ')';	
			}
		}
		return frames;
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
 	
	function negativeDeltaTiming(dict) {
 		var duration = dict.duration;
 		var callback = dict.progress;
 		var easing = perfect;
 		if (callback && !dict.easing) easing = 'linear';
 		else if (dict.easing && dict.easing != 'perfect') easing = dict.easing;
 		var delay = (dict.delay) ? dict.delay : 0;
 		if (dict.key) delay += document.timeline.currentTime;	
		return {duration:duration, easing:easing, fill:'backwards', delay:delay};
	}
	
	function negativeDeltaKeyframes(dict) {
		var frames = [], array = dict.values, type = dict.type, unit = dict.unit, steps = dict.steps, callback = dict.progress;
		if (isArray(array) && array.length > 1) {
			if (!unit) unit = "";
			var isScale = (type.substr(0,5) == 'scale');
			var isTransform = (isScale || type.substr(0,6) == 'rotate' || type.substr(0,9) == 'translate' ||  type.substr(0,6) == 'matrix');
			var name = (isTransform) ? 'transform' : type;
			var divider = (isTransform) ? ", " : " ";
			if (steps === null || steps === undefined) steps = 50;
			if (!callback || steps < 3) steps = 2;
			for (var i=0;i<steps;i++) {
				var offset = scientificToDecimal( (1.0/(steps-1))*i ) * 1.0; // offset from 0 to 1 inclusive
				var progress = 1.0 - offset;
				if (callback && i < steps) progress = 1 - callback.call(null,offset); // should I enforce 0 and 1 for first and last?
				frames[i] = {'offset':offset};
				frames[i][name] = (isTransform) ? type+'(' : '';
				for (var j = 0, length = array.length; j<length; j+=2) {
					if (j > 0) frames[i][name] += divider;
					var string = null, old = array[j], nu = array[j+1];
					if (isScale) {
						if (isNumber(old)) string = scientificToDecimal(((progress * (old-nu)) + nu) / nu) + unit;
						else string = (((progress * (old-nu)) + nu) / nu) + unit;
					} else {
						if (isNumber(old)) string = scientificToDecimal((progress * (old-nu))) + unit;
						else string = ((progress * (old-nu))) + unit;
					}
					frames[i][name] += string;
				}
				if (isTransform) frames[i][name] += ')';	
			}
		}
		return frames;
	}
	
	function negativeDeltaEffect(dict) {
		var frames = negativeDeltaKeyframes(dict);
		return new KeyframeAnimationEffect(frames,'add');
	}
	
	$.fn.copyAnimationsFrom = function(input,property) {
		if (document.timeline) copyArrays(copyingInputArray(input),copyingSelectionArray(this),property);
		return this;
	}

	$.fn.copyAnimationsTo = function(input,property) {
		if (document.timeline) copyArrays(copyingSelectionArray(this),copyingInputArray(input),property);
		return this;
	}

	$.fn.underlying = function(dict) {
		if (document.timeline) this.each( function(index) {
			var array = dict.values;
			if (array && !isArray(array)) array = dict.values.call(this);
			if (array && isArray(array) && array.length) {
				var operation = dict.operation || 'replace';
				var frames = underlyingKeyframes(dict);
				var effect = new KeyframeAnimationEffect(frames, operation);
				var delay = document.timeline.currentTime;
				var timing = {duration:0, fill:"both", delay:delay};
				var newAnim = new Animation(this, effect, timing);
				underlyingAssign(this, dict.type, newAnim);
			} else underlyingAssign(this, dict.type, null);
		});
		return this;
	};

	$.fn.seamless = function(dict) {
		if (document.timeline && dict.duration > 0) {
			this.each( function(index,element) {
				var effect = negativeDeltaEffect(dict);
				var timing = negativeDeltaTiming(dict);
				var anim = new Animation(element, effect, timing);
				document.timeline.play(anim);
			});
		}
		return this;
	};

	$.fn.hypermatic = function(dict) {
		if (dict.type && dict.type.length && dict.values && !isArray(dict.values)) {
			this.each( function(index) {
				var nu = dict.values.call(this);
				var hyperValues = $(this).data("hypermaticValueDict");
				if (!hyperValues) {
					 hyperValues = {};
					 $(this).data("hypermaticValueDict",hyperValues);
				} else if (nu) {
					var old = hyperValues[dict.type];
					if (old) {
						var values = [];
						var length = nu.length;
						for (var i=0; i<length; i++) {
							values[i*2] = old[i];
							values[(i*2)+1] = nu[i];
						}
						$(this).seamless({
							type:dict.type,
							unit:dict.unit,
							duration:dict.duration,
							easing:dict.easing,
							delay:dict.delay,
							steps:dict.steps,
							key:dict.key,
							onend:dict.onend,
							progress:dict.progress,
							values:values
						});
					}
				}
				hyperValues[dict.type] = nu;
			});
		}
		return this;
	};
 	
}( jQuery ));