var GradientContainer = require('./gradientcontainer');
var LinearGradientContainer = require('./lineargradientcontainer');

function RepeatingLinearGradientContainer(imageData) {
    LinearGradientContainer.apply(this, arguments);
    this.type = GradientContainer.TYPES.REPEATING_LINEAR;
}

RepeatingLinearGradientContainer.prototype = Object.create(LinearGradientContainer.prototype);

module.exports = RepeatingLinearGradientContainer;
