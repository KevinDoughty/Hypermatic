## Hypermatic

Hypermatic is a derivative work of:
[https://github.com/web-animations/web-animations-js-legacy](https://github.com/web-animations/web-animations-js-legacy)

Major modifications have been made to allow for relative animation.
The API more closely resembles Core Animation than what is defined in the Web-Animations spec.
This should not be used in production, 
instead it is intended to show the benefits of the relative animation pattern.
In fact, the only browser supported, and perhaps ever will be, is Chrome.

Some of the major differences include:

* The mutable interface has been removed. Animations are immutable and are accessed by name.
* The syntax has been simplified significantly from Web-Animations.
* Animations do not require a reference to the animated target.
* Effect and timing objects have been abstracted out.
* Players are owned by animated targets like DOM nodes, not a player per animation.
* Animation duration is in seconds, not milliseconds.
* Changes made to inline styles can animate implicitly. 
The developer assigns an animation delegate or a dictionary of animations to get triggered on value change.
This is essentially a workaround for the inability to extend CSS Transitions.

In the future I hope to implement:

* A timing model defined by the hierarchy of nested targets. Changing the speed or pausing a player should apply to all descendant DOM nodes.
* Animation of state and objects that do not inherit from `Node`, which is only partially implemented for React components.
* A proper spring animation

One concession the Web-Animations group made for the relative animation pattern
is in section `5.23 Script execution and live updates to the model`
[http://www.w3.org/TR/2014/WD-web-animations-20140605/](http://www.w3.org/TR/2014/WD-web-animations-20140605/)

> Changes to specified style, specified attribute values, 
> and the state of the Web Animations model made within the same execution block 
> must be synchronized when rendering such that the whole set of changes is rendered together.

This permits instantly setting the underlying value,
without a repaint causing brief flicker before adding a relative animation afterward.
The Hypermatic API is vastly different from Web-Animations, but for browsers that have implemented it, 
this line is fundamental to its performance.

I hope the Web-Animations team will make more concessions.

#### The problems with Web-Animations

One of the primary features of Web-Animations as initially envisioned was syncing animations with groups.
[https://birtles.wordpress.com/2013/07/09/group-and-conquer-timing-groups-for-your-synchronization-woes/](https://birtles.wordpress.com/2013/07/09/group-and-conquer-timing-groups-for-your-synchronization-woes/)
But this has been abandoned as Web-Animations has changed over the years.

A mutable interface makes implementing group animations a dubious prospect.
For instance, if an animation sequence has entered its fill mode phase, 
then another child animation is added, how should it be handled?
The edge cases could make Web-Animations untenable.
They are difficult to anticipate, and delay completion.
It is a mystery to me why Web-Animations has deferred groups for a later version 
but kept the mutable interface.

Facebook POP animations are mutable and cannot run off the GPU.
I have produced many examples showing that the same animation blending can be 
replicated in a readonly interface that can run off the GPU.
Also, unlike relative animation, Facebook POP animations cannot blend sequential groups or keyframes.
Web-Animations would be no different.
[https://github.com/facebook/pop/issues/64](https://github.com/facebook/pop/issues/64)

The biggest failure is their resistance to adding a simple property 
that will convert developer specified absolute values to relative values.
Perhaps it is "not invented here" syndrome, or perhaps they don't want to credit or acknowledge me.
But my requests are dismissed as trivial.
Indeed, subtraction is trivial, but without this additive animation would not be possible in CSS Transitions.
The web development world will be stuck with their inferior "to-animations" 
algorithm that unlike relative animation cannot blend timing functions, keyframes, or sequential animations.

Using milliseconds is not a good way to design animations. 
Web-Animations is in line with the ancient setTimeout syntax,
which is like a fake implementation detail because the screen refresh rate is much slower.
Apparently a different committee, the TAG working group, 
has decided against seconds in order to be consistent with the Promises API.
On the other hand, seconds is at a natural scale that humans can comprehend,
and much more usable.

Animation constructor syntax is difficult to remember and unpleasant to use.
Multiple anonymous objects containing key value pairs are mixed 
with additional arguments of strings and numbers.

Their `document.timeline.play(animation)` syntax requires the target be specified. 
This is a vestige of their goal of groups that can animate multiple targets,
yet requiring a target remains, even after groups have been deferred to a later version of the spec.
I should add that cloning a readonly animation is near useless 
as animations require a target as part of their constructor.
Animation copying is a critically important technique in relative animation.

Their alternate syntax `element.animate(effect,timing)` does not require the target, 
instead effect and timing get added to the target, but this is not an animation.
The division of effect and timing makes helper functions and convenience constructors awkward.
A framework built on top of Web-Animations would have to return an array of both an effect and timing object,
which the developer would used to construct an animation.This has plagued me since the beginning.

Of course, I would be remiss to not mention that Hypermatic would not be possible without 
the hard work Web-Animations team, and I am grateful. I couldn't have made this without them.
I just hope they will correct what are in my opinion glaring oversights.

#### API Reference

Coming soon.

Be aware that this framework is not fully envisioned, nowhere near finished, 
and will be subject to volatile changes.

#### Examples

[http://kevindoughty.github.io/Hypermatic/keyframeBlend.html](http://kevindoughty.github.io/Hypermatic/keyframeBlend.html)
[http://kevindoughty.github.io/Hypermatic/chainBlend.html](http://kevindoughty.github.io/Hypermatic/chainBlend.html)
[http://kevindoughty.github.io/Hypermatic/relativeFloat.html](http://kevindoughty.github.io/Hypermatic/relativeFloat.html)
[http://kevindoughty.github.io/Hypermatic/fourWays.html](http://kevindoughty.github.io/Hypermatic/fourWays.html)
[http://kevindoughty.github.io/Hypermatic/relativeLayout.html](http://kevindoughty.github.io/Hypermatic/relativeLayout.html)

