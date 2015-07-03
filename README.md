## Hypermatic

`Hypermatic` is a derivative work of:
[https://github.com/web-animations/web-animations-js-legacy](https://github.com/web-animations/web-animations-js-legacy)

It is no longer a jQuery plugin with the Web-Animations javascript shim as a dependency.
Major modifications have been made to allow for relative animation.
The API more closely resembles Core Animation than what is defined in the Web-Animations spec.
Animations are immutable and are accessed by name.
The syntax has been simplified significantly from Web-Animations.
Animations do not require a reference to the animated target.
Group and chain animations can only affect what they are added to.

Effect and timing have been merged.
Players are coupled to animated targets, not animations.
This will allow a timing model dependent on a hierarchy of nested targets, but is unfinished.

Changes to inline styles can animate implicitly, giving CSS Transition behavior.

More documentation coming soon.