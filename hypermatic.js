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
		return !isNaN(parseFloat(w)) && isFinite(w); //jQuery.isNumeric(w);
	}
	
	function isArray(w) {
		return Object.prototype.toString.call(w) === '[object Array]'; //jQuery.isArray(w);
	}
	
	function isString(w) {
		return (typeof w == 'string' || w instanceof String); //jQuery.type(w) === 'string';
	}
	
	function isElement(w) {
		return (w instanceof HTMLElement);
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
	
	function underlyingKeyframes(dict) {
		var frames = [], array = dict.values, type = dict.type, unit = dict.unit, steps = dict.steps, callback = dict.progress;
		if (array && !isArray(array)) array = dict.values.call(this);
		if (array && isArray(array) && array.length) {
			if (!unit) unit = "";
			var isScale = (type.substr(0,5) == 'scale');
			var isTransform = (isScale || type.substr(0,6) == 'rotate' || type.substr(0,9) == 'translate' ||  type.substr(0,6) == 'matrix');
			var name = (isTransform) ? 'transform' : type;
			var divider = (isTransform) ? ", " : " ";
			for (var i=0;i<2;i++) {
				frames[i] = {'offset':i};
				frames[i][name] = (isTransform) ? type+'(' : '';
				for (var j = 0; j<array.length; j++) {
					if (j > 0) frames[i][name] += divider;
					var converted = scientificToDecimal(array[j])
					if (isNumber(converted)) frames[i][name] += converted+unit;
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
 		var easing = perfect;
 		if (dict.easing && typeof dict.easing != 'string') easing = 'linear';
 		else if (dict.easing) easing = dict.easing;
 		var delay = (dict.delay) ? dict.delay : 0;
 		if (dict.key) delay += document.timeline.currentTime;	
		return {duration:duration, easing:easing, fill:'backwards', delay:delay};
	}
	
	function negativeDeltaKeyframes(dict,values) {
		if (!values) values = dict.values;
		var frames = [], type = dict.type, unit = dict.unit, steps = dict.steps;
		var callback = null;
		if (dict.easing && typeof dict.easing != 'string') callback = dict.easing;
		if (isArray(values) && values.length > 1) {
			if (!unit) unit = "";
			var isScale = (type.substr(0,5) == 'scale');
			var isTransform = (isScale || type.substr(0,6) == 'rotate' || type.substr(0,9) == 'translate' ||  type.substr(0,6) == 'matrix');
			var name = (isTransform) ? 'transform' : type;
			var divider = (isTransform) ? ", " : " ";
			if (steps === null || steps === undefined) steps = defaultSteps;
			if (!callback || steps < 3) steps = 2;
			for (var i=0;i<steps;i++) {
				var offset = scientificToDecimal( (1.0/(steps-1))*i ) * 1.0; // offset from 0 to 1 inclusive
				var progress = 1.0 - offset;
				if (callback && i < steps) progress = 1 - callback.call(null,offset); // should I enforce 0 and 1 for first and last?
				frames[i] = {'offset':offset};
				frames[i][name] = (isTransform) ? type+'(' : '';
				for (var j = 0, length = values.length; j<length; j+=2) {
					if (j > 0) frames[i][name] += divider;
					var string = null, old = values[j], nu = values[j+1];
					if (isScale) string = scientificToDecimal(((progress * (old-nu)) + nu) / nu) + unit;
					else string = scientificToDecimal((progress * (old-nu))) + unit;
					frames[i][name] += string;
				}
				if (isTransform) frames[i][name] += ')';
			}
		}
		return frames;
	}
	
	function negativeDeltaEffect(dict,values) {
		var frames = negativeDeltaKeyframes(dict,values);
		return new KeyframeAnimationEffect(frames,'add');
	}
	
	function underlying(element,dict,values) {
		if (document.timeline) {
			if (!values) values = dict.values;
			if (values && !isArray(values)) values = values.call(element);
			if (values && isArray(values) && values.length) {
				var operation = dict.operation || 'replace';
				var frames = underlyingKeyframes(dict);
				var effect = new KeyframeAnimationEffect(frames, operation);
				var delay = document.timeline.currentTime;
				var timing = {duration:0, fill:"both", delay:delay};
				var anim = new Animation(element, effect, timing);
				underlyingAssign(element, dict.type, anim);
			} else underlyingAssign(element, dict.type, null);
		}
	}
	
	function seamless(element,dict,values) {
		if (dict.duration > 0) {
			if (!values) values = dict.values;
			if (values && !isArray(values)) values = values.call(element);
			if (values && isArray(values) && values.length) {
				for (var length = values.length, i = 1; i < length; i+=2) {
					if (values[i-1] - values[i]) {
						var effect = negativeDeltaEffect(dict, values);
						var timing = negativeDeltaTiming(dict);
						var anim = new Animation(element, effect, timing);
						document.timeline.play(anim);
						break;
					}
				}
			}
		}
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
		if (document.timeline && dict.type && dict.values) this.each( function(index,element) {
			underlying(element,dict);
		});
		return this;
	};

	$.fn.seamless = function(dict) {
		if (document.timeline && dict.type && dict.values) {
			this.each( function(index,element) {
				seamless(element,dict);
			});
		}
		return this;
	};

	$.fn.hypermatic = function(dict) {	
		if (document.timeline && dict.type && dict.values) {
			this.each( function(index,element) {
				var nu = dict.values;
				var hyperValues = $(element).data("hypermaticValueDict");
				if (!hyperValues) {
					 hyperValues = {};
					 $(element).data("hypermaticValueDict",hyperValues);
				} 
				if (nu) {
					if (!isArray(nu)) nu = nu.call(element);
					var old = hyperValues[dict.type];
					var fill = (dict.fill === true || dict.fill == "forwards" || dict.fill == "both");
					if (old || fill) {
						var values = [];
						var length = nu.length;
						for (var i=0; i<length; i++) {
							values[i*2] = (old === null || old === undefined) ? 0.0000 : old[i];
							values[(i*2)+1] = nu[i];
						}
						if (fill) {
							var newValues = [];
							for (var i=0; i<length; i+=2) {
								newValues[newValues.length] = values[i];
							}
							underlying(element,dict,newValues);
						}
						seamless(element,dict,values);
					}
				}
				hyperValues[dict.type] = nu;
			});
		}
		return this;
	};
 	
}( jQuery ));