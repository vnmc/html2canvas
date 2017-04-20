var GradientContainer = require('./gradientcontainer');
var Color = require('./color');

function LinearGradientContainer(imageData) {
    GradientContainer.apply(this, arguments);
    this.type = GradientContainer.TYPES.LINEAR;

    // default angle: from top to bottom
    this.angle = Math.PI;

    var hasDirection =
        LinearGradientContainer.REGEXP_DIRECTION.test(imageData.args[0]) ||
        !GradientContainer.REGEXP_COLORSTOP.test(imageData.args[0]);

    if (hasDirection) {
        if (LinearGradientContainer.REGEXP_ANGLE.test(imageData.args[0])) {
            this.angle = parseFloat(imageData.args[0]) / 180 * Math.PI;

            // if there is a prefix, the 0° angle points due East (instead of North per W3C)
            if (imageData.prefix) {
                this.angle -= Math.PI * 0.5;
            }
        } else {
            var parts = imageData.args[0].split(/\s+/);
            var hasTo = false;
            
            if (parts[0] === 'to') {
                hasTo = true;
                parts.shift();
            }

            var angle = 0;
            var len = parts.length;
            for (var i = 0; i < len; i++) {
                angle += LinearGradientContainer.ANGLES[parts[i]] || 0;
            }

            this.angle = angle / len + (hasTo ? Math.PI : 0);
        }

        this.parseColorStops(imageData.args.slice(1));
    } else {
        this.parseColorStops(imageData.args);
    }
}

LinearGradientContainer.prototype = Object.create(GradientContainer.prototype);

LinearGradientContainer.REGEXP_DIRECTION = /^\s*(?:to|left|right|top|bottom|\d*(?:\.\d+)?deg)(?:\s|$)/i;
LinearGradientContainer.REGEXP_ANGLE = /^\d*(?:\.\d+)?deg\s*$/i;

LinearGradientContainer.ANGLES = {
    bottom: 0,
    left: Math.PI * 0.5,
    top: Math.PI,
    right: Math.PI * 1.5
};

module.exports = LinearGradientContainer;
