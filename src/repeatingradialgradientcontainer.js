var GradientContainer = require('./gradientcontainer');
var RadialGradientContainer = require('./radialgradientcontainer');

function RepeatingRadialGradientContainer(imageData) {
    RadialGradientContainer.apply(this, arguments);
    this.type = GradientContainer.TYPES.REPEATING_RADIAL;
}

RepeatingRadialGradientContainer.prototype = Object.create(RadialGradientContainer.prototype);

module.exports = RepeatingRadialGradientContainer;
