## Hypermatic

`Hypermatic` is a jQuery plugin for producing relative animation using the unfinished [Web Animations](http://www.w3.org/TR/web-animations/) [javascript shim](https://github.com/web-animations/web-animations-js).
The animations are additive, declared absolutely but are converted to relative behind the scenes,
animating from the old value minus the new value, to a destination value of zero.
This is the best technique for responding to rapid user events.
More in depth explaination and interactive demos are avaliable at [http://kxdx.org](http://kxdx.org).
The Web Animations spec is still in draft and subject to change, which happens often. 
Because of volatility this is should not be used in the real world.

I am grateful to Brian Birtles and Shane Stephens for their assistance in getting me up and running, 
and for their greater efforts in bringing Web-Animations to the world.

### $.fn.hypermatic()

The primary function, which takes an object literal for the sole argument.
There are three ways to define animation origin and destination values,
`old` and `nu`, `values`, or `from` and `to`, but only one may be used at any given time.
The various properties and values are explained below:


#### `type`

Required.
String value is either a CSS property or transform operation to be animated.
For example, `left` or `translate`.

#### `unit`

Optional, depending on the `type`.
String value is the CSS unit, for example `px`.
For scale transforms this can be an empty string or omitted.

#### `duration`

Optional, value default is 0.

#### `fill`

Optional boolean value with a default of `false`.
This is intended to be used in cases where layout is not defined by CSS,
for example the user dragging an element.
The web-animations javascript shim animates inline element.style properties,
so one cannot manually set values or position elements that way if they are also to be animated.

This is expensive. For things like a grid layout, 
it is recommended instead that one positions using the CSS properties `left` and `top`,
then animates using `translate`.

This might be renamed in future versions.

#### `steps`

Optional, defaults to 50 if `easing` is used, has no effect otherwise. This is needed because `easing` is emulated using keyframes.

#### `old` and `nu`

Specify animation origin and destination values absolutely but have them converted to relative animations behind the scenes,
from the old value minus the new value, to a destination of zero.
Only `nu` is required. It is named this way because `new` is a reserved word.
jQuery data() is used to store the previous value.
If `old` is intended to be omitted, 
it might be necessary to populate the current value by calling this function once prior,
with a zero duration.
One can pass a single value, an array of values, 
or a function that returns the correct value.
In the case of functions, the keyword `this` refers to the animated element,
allowing one to query the DOM for values.

You must return the correct count of values, 
for example `translate3d` requires 3 values for each `old` or `nu`.
You must not combine this with use of `values`, `from`, or `to`.

#### `values`

Similar to `old` and `nu`, but combined into one array of alternating values.
In other words, `translate3d` requires 6 values: (old x, new x, old y, new y, old z, new z).
One cannot pass a single value, only an array or a function that returns an array.
You may not omit entries expecting them to result in zero, 
as the function has no knowledge of how many arguments are needed for any given property.
You must not combine this with use of `old`, `nu`, `from`, or `to`.

#### `from` and `to`

This mode does not convert origin and destination to relative "old minus new" behind the scenes.
It is primarily intended for the four-argument `rotate3d`, 
where it probably does not make sense for every value to be converted to "old minus new".
Currently there is no way to disable additive, 
but this might be added in the future for use with this mode
You must not combine this with use of `old`, `nu`, or `values`.

#### `easing`

Optional. Specify how the animation progresses by passing a function which takes a single argument,
progress between 0 and 1.
The return value is the modified progress, which can be below 0 or exceed 1.
If `easing` is omitted, 
simple smoothing is provided by substituting a cubic bezier with control points `0.5, 0.0, 0.5, 1.0`.


## License

Released under the [MIT License](http://opensource.org/licenses/MIT).

## TODO:

Documentation unfinished.
Need code examples.
For now, some interactive demos and their source may be viewed at:
[http://kxdx.org/animated-tree-menu/](http://kxdx.org/animated-tree-menu/)

[http://kxdx.org/negative-delta-float/](http://kxdx.org/negative-delta-float/)

[http://kxdx.org/negative-delta-translate/](http://kxdx.org/negative-delta-translate/)
