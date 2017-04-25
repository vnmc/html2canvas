var Renderer = require('../renderer');
var LinearGradientContainer = require('../lineargradientcontainer');
var RadialGradientContainer = require('../radialgradientcontainer');
var RepeatingLinearGradientContainer = require('../repeatinglineargradientcontainer');
var RepeatingRadialGradientContainer = require('../repeatingradialgradientcontainer');
var utils = require('../utils');
var log = require('../log');

function CanvasRenderer(width, height) {
    Renderer.apply(this, arguments);
    this.canvas = this.options.canvas || this.document.createElement("canvas");
    if (!this.options.canvas) {
        this.canvas.width = width;
        this.canvas.height = height;
    }
    this.ctx = this.canvas.getContext("2d");
    this.taintCtx = this.document.createElement("canvas").getContext("2d");
    this.ctx.textBaseline = "bottom";
    this.variables = {};
    log("Initialized CanvasRenderer with size", width, "x", height);
}

CanvasRenderer.prototype = Object.create(Renderer.prototype);

CanvasRenderer.prototype.setFillStyle = function(fillStyle) {
    this.ctx.fillStyle = typeof(fillStyle) === "object" && !!fillStyle.isColor ? fillStyle.toString() : fillStyle;
    return this.ctx;
};

CanvasRenderer.prototype.rectangle = function(left, top, width, height, color) {
    this.setFillStyle(color).fillRect(left, top, width, height);
};

CanvasRenderer.prototype.circle = function(left, top, size, color) {
    this.setFillStyle(color);
    this.ctx.beginPath();
    this.ctx.arc(left + size / 2, top + size / 2, size / 2, 0, Math.PI*2, true);
    this.ctx.closePath();
    this.ctx.fill();
};

CanvasRenderer.prototype.circleStroke = function(left, top, size, color, stroke, strokeColor) {
    this.circle(left, top, size, color);
    this.ctx.strokeStyle = strokeColor.toString();
    this.ctx.stroke();
};

CanvasRenderer.prototype.shadow = function(shape, shadows, container, inset, borders) {
    var context = this.ctx;
    var shadowShape = inset ? this.createMaskShapes(shape, container) : shape;
    var shadowShapeOuterRect = inset ? shadowShape[0] : null;
    var isInsetWithBorders = inset ? borders && (borders[0].width > 0 || borders[1].width > 0 || borders[2].width > 0 || borders[3].width > 0) : false;
    var infos = [];
    var isFirst = true;
    var info;

    // draw shadows without spread
    for (var i = shadows.length - 1; i >= 0; i--) {
        info = utils.parseShadow(shadows[i]);
        infos.push(info);

        if ((info.inset !== null) !== inset || info.spread || isInsetWithBorders) {
            continue;
        }

        if (isFirst) {
            context.save();
            this.shape(shadowShape);
            this.setFillStyle('#ffffff');
            isFirst = false;
        }

        context.shadowOffsetX = info.x;
        context.shadowOffsetY = info.y;
        context.shadowColor = info.color;
        context.shadowBlur = info.blur;
        context.fill();
    }

    if (!isFirst) {
        context.restore();
    }

    // draw shadows with spread
    for (i = 0; i < infos.length; i++) {
        info = infos[i];
        var spread = info.spread || 0;

        if (((info.inset !== null) !== inset || !spread) && !isInsetWithBorders) {
            continue;
        }

        context.save();

        // create a transform to resize the shape by the amount of the spread
        var bounds = utils.getShapeBounds(shape);
        var origWidth = bounds.width;

        if (inset && borders) {
            bounds.top += borders[0].width;
            bounds.right -= borders[1].width;
            bounds.bottom -= borders[2].width;
            bounds.left += borders[3].width;
            bounds.width = bounds.right - bounds.left;
            bounds.height = bounds.bottom - bounds.top;
        }

        var midX = bounds.left + 0.5 * bounds.width;
        var midY = bounds.top + 0.5 * bounds.height;
        var f = (bounds.width + (inset ? -2 : 2) * spread) / origWidth;
        context.translate(midX, midY);
        context.transform(f, 0, 0, f, info.x, info.y);
        context.translate(-midX, -midY);

        // correct the outer rectangle of the mask by the inverse transform
        if (inset) {
            var invF = 1 / f;
            shadowShape[0] = [
                "rect",
                invF * (shadowShapeOuterRect[1] - midX) - info.x + midX,
                invF * (shadowShapeOuterRect[2] - midY) - info.y + midY,
                invF * shadowShapeOuterRect[3],
                invF * shadowShapeOuterRect[4]
            ];
        }

        if (!info.blur) {
            context.shadowOffsetX = 0;
            context.shadowOffsetY = 0;
            context.shadowColor = info.color;
            context.shadowBlur = info.blur;
        } else {
            // TODO: "filter" is only available in some browsers
            context.filter = "blur(" + info.blur * 0.3 + "px)";
        }

        this.shape(shadowShape);
        this.setFillStyle(info.color);
        context.fill();
        context.restore();
    }
};

CanvasRenderer.prototype.drawShape = function(shape, color) {
    this.shape(shape);
    this.setFillStyle(color).fill();
};

CanvasRenderer.prototype.taints = function(imageContainer) {
    if (imageContainer.tainted === null) {
        this.taintCtx.drawImage(imageContainer.image, 0, 0);
        try {
            this.taintCtx.getImageData(0, 0, 1, 1);
            imageContainer.tainted = false;
        } catch(e) {
            this.taintCtx = document.createElement("canvas").getContext("2d");
            imageContainer.tainted = true;
        }
    }

    return imageContainer.tainted;
};

CanvasRenderer.prototype.drawImage = function(imageContainer, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (!this.taints(imageContainer) || this.options.allowTaint) {
        this.ctx.drawImage(imageContainer.image, sx, sy, sw, sh, dx, dy, dw, dh);
    }
};

CanvasRenderer.prototype.clip = function(shapes, callback, context, container) {
    this.ctx.save();
    shapes.filter(hasEntries).forEach(function(shape) {
        this.shape(shape).clip();
    }, this);
    callback.call(context);
    this.ctx.restore();
};

CanvasRenderer.prototype.createMaskShapes = function(shapes, container) {
    var shape = shapes[shapes.length-1];
    var canvasBorderCCW = container.canvasBorder ? [
            "rect",
            Math.max(container.canvasBorder[0], container.canvasBorder[2]),
            Math.min(container.canvasBorder[1], container.canvasBorder[3]),
            -Math.abs(container.canvasBorder[0] - container.canvasBorder[2]),
            Math.abs(container.canvasBorder[1] - container.canvasBorder[3])
        ] : ["rect", this.canvas.width, 0, -this.canvas.width, this.canvas.height];

    return [canvasBorderCCW].concat(shape).concat([shape[0]]);
};

CanvasRenderer.prototype.mask = function(shapes, callback, context, container) {
    var borderClip = shapes[shapes.length-1];
    var maskShapes = shapes;

    if (borderClip && borderClip.length) {
        maskShapes = shapes.slice(0,-1);
        maskShapes.push(this.createMaskShapes(shapes, container));
    }

    this.clip(maskShapes, callback, context, container);
};

CanvasRenderer.prototype.shape = function(shape) {
    this.ctx.beginPath();
    shape.forEach(function(point, index) {
        if (point[0] === "rect") {
            this.ctx.rect.apply(this.ctx, point.slice(1));
        } else {
            this.ctx[(index === 0) ? "moveTo" : point[0] + "To" ].apply(this.ctx, point.slice(1));
        }
    }, this);
    this.ctx.closePath();
    return this.ctx;
};

CanvasRenderer.prototype.font = function(color, style, variant, weight, size, family) {
    variant = /^(normal|small-caps)$/i.test(variant) ? variant : '';
    this.setFillStyle(color).font = [style, variant, weight, size, family].join(" ").split(",")[0];
};

CanvasRenderer.prototype.fontShadow = function(color, offsetX, offsetY, blur) {
    this.setVariable("shadowColor", color.toString())
        .setVariable("shadowOffsetX", offsetX)
        .setVariable("shadowOffsetY", offsetY)
        .setVariable("shadowBlur", blur);
};

// https://github.com/niklasvh/html2canvas/pull/908/commits/9eb4f7d19397300db58669d689ff96f5e0d8848f
CanvasRenderer.prototype.renderTextShadow = function(text, bounds, shadows) {
    for (var i = 0; i < shadows.length ; i++) {
        this.fontShadow(shadows[i].color, shadows[i].offsetX, shadows[i].offsetY, shadows[i].blur);
        this.text(text, bounds.left, bounds.bottom);
    }
};

CanvasRenderer.prototype.clearShadow = function() {
    this.setVariable("shadowColor", "rgba(0,0,0,0)");
};

CanvasRenderer.prototype.setOpacity = function(opacity) {
    this.ctx.globalAlpha = opacity;
};

CanvasRenderer.prototype.setTransform = function(transform) {
    this.ctx.translate(transform.origin[0], transform.origin[1]);
    this.ctx.transform.apply(this.ctx, transform.matrix);
    this.ctx.translate(-transform.origin[0], -transform.origin[1]);
};

CanvasRenderer.prototype.setVariable = function(property, value) {
    if (this.variables[property] !== value) {
        this.variables[property] = this.ctx[property] = value;
    }

    return this;
};

CanvasRenderer.prototype.text = function(text, left, bottom) {
    this.ctx.fillText(text, left, bottom);
};

CanvasRenderer.prototype.backgroundRepeatShape = function(imageContainer, backgroundPosition, size, bounds, left, top, width, height, borderData) {
    var shape = [
        ["line", Math.round(left), Math.round(top)],
        ["line", Math.round(left + width), Math.round(top)],
        ["line", Math.round(left + width), Math.round(height + top)],
        ["line", Math.round(left), Math.round(height + top)]
    ];
    this.clip([shape], function() {
        this.renderBackgroundRepeat(imageContainer, backgroundPosition, size, bounds, borderData[3], borderData[0]);
    }, this);
};

CanvasRenderer.prototype.renderBackgroundRepeat = function(imageContainer, backgroundPosition, size, bounds, borderLeft, borderTop) {
    var offsetX = Math.round(bounds.left + backgroundPosition.left + borderLeft), offsetY = Math.round(bounds.top + backgroundPosition.top + borderTop);
    this.setFillStyle(this.ctx.createPattern(this.resizeImage(imageContainer, size), "repeat"));
    this.ctx.translate(offsetX, offsetY);
    this.ctx.fill();
    this.ctx.translate(-offsetX, -offsetY);
};

function dist(x, y) {
    return Math.sqrt(x * x + y * y);
}

function findCorner(bounds, x, y, closest) {
    var corners = [
        [bounds.left, bounds.top],
        [bounds.left, bounds.bottom],
        [bounds.right, bounds.top],
        [bounds.right, bounds.bottom]
    ];

    var distOpt = closest ? Infinity : -Infinity;
    var idx = -1;

    for (var i = 0; i < corners.length; i++) {
        var d = dist(x - corners[i][0], y - corners[i][1]);
        if (closest ? d < distOpt : d > distOpt) {
            distOpt = d;
            idx = i;
        }
    }

    return corners[idx];
}

CanvasRenderer.prototype.renderBackgroundGradient = function(gradientImage, bounds) {
    var gradient;
    var needsRestore = false;

    if (gradientImage instanceof LinearGradientContainer) {
        gradient = this.createLinearGradient(gradientImage, bounds);
    } else if (gradientImage instanceof RadialGradientContainer) {
        var ret = this.createRadialGradient(gradientImage, bounds);
        gradient = ret.gradient;
        needsRestore = ret.needsRestore;
    } else if (gradientImage instanceof RepeatingLinearGradientContainer) {
        // TODO
    } else if (gradientImage instanceof RepeatingRadialGradientContainer) {
        // TODO
    }

    if (gradient) {
        gradientImage.colorStops.forEach(function(colorStop) {
            gradient.addColorStop(colorStop.stop, colorStop.color.toString());
        });

        this.rectangle(bounds.left, bounds.top, bounds.width, bounds.height, gradient);
    }

    if (needsRestore) {
        this.ctx.restore();
    }
};

CanvasRenderer.prototype.createLinearGradient = function(gradientImage, bounds) {
    // normalize the angle (0 <= alpha < 2π)
    var alpha = gradientImage.angle % (2 * Math.PI);
    if (alpha < 0) {
        alpha += 2 * Math.PI;
    }

    var d = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height);
    var beta = Math.atan2(bounds.height, bounds.width);
    var a;

    if (alpha < Math.PI * 0.5) {
        // (0,h)
        a = d * Math.sin(alpha + beta);
        return this.ctx.createLinearGradient(
            bounds.left,
            bounds.bottom,
            bounds.left + a * Math.sin(alpha),
            bounds.bottom - a * Math.cos(alpha)
        );
    }

    if (alpha < Math.PI) {
        // (0,0)
        a = d * Math.sin(alpha - beta);
        return this.ctx.createLinearGradient(
            bounds.left,
            bounds.top,
            bounds.left + a * Math.sin(alpha),
            bounds.top - a * Math.cos(alpha)
        );
    }

    if (alpha < Math.PI * 1.5) {
        // (w,0)
        a = d * Math.sin(alpha + beta);
        return this.ctx.createLinearGradient(
            bounds.right,
            bounds.top,
            bounds.right - a * Math.sin(alpha),
            bounds.top + a * Math.cos(alpha)
        );
    }

    // (w,h)
    a = d * Math.sin(alpha - beta);
    return this.ctx.createLinearGradient(
        bounds.right,
        bounds.bottom,
        bounds.right - a * Math.sin(alpha),
        bounds.bottom + a * Math.cos(alpha)
    );
};

CanvasRenderer.prototype.createRadialGradient = function(gradientImage, bounds) {
    var rx, ry, c, corner;
    var needsRestore = false;

    var x = gradientImage.position.x.value;
    if (gradientImage.position.x.isRelative) {
        x *= bounds.width;
    }
    var y = gradientImage.position.y.value;
    if (gradientImage.position.y.isRelative) {
        y *= bounds.height;
    }

    x += bounds.left;
    y += bounds.top;

    switch (gradientImage.radius.descriptor) {
    case 'closest-side':
        // the ending shape is sized so that that it exactly meets the side of the gradient box closest to the gradient’s center
        // if the shape is an ellipse, it exactly meets the closest side in each dimension
        if (gradientImage.isCircle) {
            rx = ry = Math.min(Math.abs(x - bounds.left), Math.abs(x - bounds.right), Math.abs(y - bounds.top), Math.abs(y - bounds.bottom));
        } else {
            rx = Math.min(Math.abs(x - bounds.left), Math.abs(x - bounds.right));
            ry = Math.min(Math.abs(y - bounds.top), Math.abs(y - bounds.bottom));
        }
        break;

    case 'closest-corner':
        // the ending shape is sized so that that it passes through the corner of the gradient box closest to the gradient’s center
        // if the shape is an ellipse, the ending shape is given the same aspect-ratio it would have if closest-side were specified
        if (gradientImage.isCircle) {
            rx = ry = Math.min(
                dist(x - bounds.left, y - bounds.top),
                dist(x - bounds.left, y - bounds.bottom),
                dist(x - bounds.right, y - bounds.top),
                dist(x - bounds.right, y - bounds.bottom)
            );
        } else {
            // compute the ratio ry/rx (which is to be the same as for "closest-side")
            c = Math.min(Math.abs(y - bounds.top), Math.abs(y - bounds.bottom)) / Math.min(Math.abs(x - bounds.left), Math.abs(x - bounds.right));
            corner = findCorner(bounds, x, y, true);
            rx = Math.sqrt((corner[0] - x) * (corner[0] - x) + (corner[1] - y) * (corner[1] - y) / (c * c));
            ry = c * rx;
        }
        break;

    case 'farthest-side':
        // same as closest-side, except the ending shape is sized based on the farthest side(s)
        if (gradientImage.isCircle) {
            rx = ry = Math.max(Math.abs(x - bounds.left), Math.abs(x - bounds.right), Math.abs(y - bounds.top), Math.abs(y - bounds.bottom));
        } else {
            rx = Math.max(Math.abs(x - bounds.left), Math.abs(x - bounds.right));
            ry = Math.max(Math.abs(y - bounds.top), Math.abs(y - bounds.bottom));
        }
        break;

    case 'farthest-corner':
        // same as closest-corner, except the ending shape is sized based on the farthest corner
        // if the shape is an ellipse, the ending shape is given the same aspect ratio it would have if farthest-side were specified
        if (gradientImage.isCircle) {
            rx = ry = Math.max(
                dist(x - bounds.left, y - bounds.top),
                dist(x - bounds.left, y - bounds.bottom),
                dist(x - bounds.right, y - bounds.top),
                dist(x - bounds.right, y - bounds.bottom)
            );
        } else {
            // compute the ratio ry/rx (which is to be the same as for "farthest-side")
            c = Math.max(Math.abs(y - bounds.top), Math.abs(y - bounds.bottom)) / Math.max(Math.abs(x - bounds.left), Math.abs(x - bounds.right));
            corner = findCorner(bounds, x, y, false);
            rx = Math.sqrt((corner[0] - x) * (corner[0] - x) + (corner[1] - y) * (corner[1] - y) / (c * c));
            ry = c * rx;
        }
        break;

    default:
        // pixel or percentage values
        rx = (gradientImage.radius.x && gradientImage.radius.x.value) || 0;
        ry = (gradientImage.radius.y && gradientImage.radius.y.value) || rx;
        if (gradientImage.radius.isRelative) {
            rx *= bounds.width;
            ry *= bounds.height;
        }
        break;
    }

    if (rx !== ry) {
        // transforms for elliptical radial gradient
        needsRestore = true;
        this.ctx.save();

        var midX = bounds.left + 0.5 * bounds.width;
        var midY = bounds.top + 0.5 * bounds.height;
        var f = ry / rx;
        this.ctx.translate(midX, midY);
        this.ctx.transform(1, 0, 0, f, 0, 0);
        this.ctx.translate(-midX, -midY);

        var invF = 1 / f;
        bounds.top = invF * (bounds.top - midY) + midY;
        bounds.height *= invF;
    }

    return {
        gradient: this.ctx.createRadialGradient(x, y, 0, x, y, rx),
        needsRestore: needsRestore
    };
};

CanvasRenderer.prototype.resizeImage = function(imageContainer, size) {
    var image = imageContainer.image;
    if(image.width === size.width && image.height === size.height) {
        return image;
    }

    var ctx, canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, size.width, size.height );
    return canvas;
};

function hasEntries(array) {
    return array.length > 0;
}

module.exports = CanvasRenderer;
