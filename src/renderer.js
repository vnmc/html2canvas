var log = require('./log');
var LinearGradientContainer = require('./lineargradientcontainer');
var RadialGradientContainer = require('./radialgradientcontainer');
var RepeatingLinearGradientContainer = require('./repeatinglineargradientcontainer');
var RepeatingRadialGradientContainer = require('./repeatingradialgradientcontainer');

function Renderer(width, height, images, options, document) {
    this.width = width;
    this.height = height;
    this.images = images;
    this.options = options;
    this.document = document;
}

Renderer.prototype.renderImage = function(container, bounds, borderData, imageContainer) {
    var paddingLeft = container.cssInt('paddingLeft'),
        paddingTop = container.cssInt('paddingTop'),
        paddingRight = container.cssInt('paddingRight'),
        paddingBottom = container.cssInt('paddingBottom'),
        borders = borderData.borders;

    var width = bounds.width - (borders[1].width + borders[3].width + paddingLeft + paddingRight);
    var height = bounds.height - (borders[0].width + borders[2].width + paddingTop + paddingBottom);
    this.drawImage(
        imageContainer,
        0,
        0,
        imageContainer.image.videoWidth || imageContainer.image.width || width,
        imageContainer.image.videoHeight || imageContainer.image.height || height,
        bounds.left + paddingLeft + borders[3].width,
        bounds.top + paddingTop + borders[0].width,
        width,
        height
    );
};

Renderer.prototype.renderBackground = function(container, bounds, borderData) {
    if (bounds.height > 0 && bounds.width > 0) {
        this.renderBackgroundColor(container, bounds);
        this.renderBackgroundImage(container, bounds, borderData);
    }
};

Renderer.prototype.renderBackgroundColor = function(container, bounds) {
    var color = container.color("backgroundColor");
    if (!color.isTransparent()) {
        this.rectangle(bounds.left, bounds.top, bounds.width, bounds.height, color);
    }
};

Renderer.prototype.renderShadows = function(container, shape, borderData, inset) {
    var boxShadow = container.css("boxShadow");
    if (boxShadow && boxShadow !== "none" && /(?:^|\s+)inset(?:$|\s+)/i.test(boxShadow) === inset) {
        var shadows = boxShadow.split(/,(?![^(]*\))/);
        this.shadow(shape, shadows, container, inset, borderData && borderData.borders);
    }
};

Renderer.prototype.renderBorders = function(borders) {
    borders.forEach(this.renderBorder, this);
};

Renderer.prototype.renderBorder = function(data) {
    if (!data.color.isTransparent() && data.args !== null) {
        if (data.style === 'dashed' || data.style === 'dotted') {
            var dash = (data.style === 'dashed') ? 3 : data.width;
            this.ctx.setLineDash([dash]);
            this.path(data.pathArgs);
            this.ctx.strokeStyle = data.color;
            this.ctx.lineWidth = data.width;
            this.ctx.stroke();
        } else {
            this.drawShape(data.args, data.color);
        }
    }
};

Renderer.prototype.renderBackgroundImage = function(container, bounds, borderData) {
    var backgroundImages = container.parseBackgroundImages();
    backgroundImages.reverse().forEach(function(backgroundImage, index, arr) {
        switch(backgroundImage.method) {
        case "url":
            var image = this.images.get(backgroundImage.args[0]);
            if (image) {
                this.renderBackgroundRepeating(container, bounds, image, arr.length - (index+1), borderData);
            } else {
                log("Error loading background-image", backgroundImage.args[0]);
            }
            break;
        case "linear-gradient":
        case "radial-gradient":
        case "repeating-linear-gradient":
        case "repeating-radial-gradient":
        case "gradient":
            var gradientImage = this.images.get(backgroundImage.value);
            if (gradientImage) {
                var gradientBounds, gradient;
                var backgroundBounds = container.parseBackgroundOrigin(bounds, index, true);
                var backgroundSize = container.parseBackgroundSize(backgroundBounds, backgroundBounds, index);
                var backgroundSizeStr = container.css("backgroundSize");

                if ((/^auto/i.test(backgroundSizeStr) && /auto$/i.test(backgroundSizeStr) && container.css("backgroundOrigin") !== "content-box") || container.css("backgroundRepeat") === "no-repeat") {
                    // draw one instance of the gradient
                    var backgroundPosition = container.parseBackgroundPosition(backgroundBounds, backgroundBounds, index, backgroundSize);
                    var left = backgroundBounds.left + backgroundPosition.left;
                    var top = backgroundBounds.top + backgroundPosition.top;
                    gradientBounds = {
                        left: left,
                        top: top,
                        right: left + backgroundSize.width,
                        bottom: top + backgroundSize.height,
                        width: backgroundSize.width,
                        height: backgroundSize.height
                    };
                    gradient = this.createGradient(container, gradientImage, gradientBounds);
                    if (gradient) {
                        this.renderGradient(gradient, gradientBounds);
                    } else {
                        log("Error creating gradient", backgroundImage.args[0]);
                    }
                } else {
                    // repeated gradient
                    gradientBounds = {
                        left: 0,
                        top: 0,
                        right: backgroundSize.width,
                        bottom: backgroundSize.height,
                        width: backgroundSize.width,
                        height: backgroundSize.height
                    };
                    gradient = this.createGradient(gradientImage, gradientBounds);
                    if (gradient) {
                        // copy the options
                        var options = {};
                        for (var k in this.options) {
                            options[k] = this.options[k];
                        }
                        // let the renderer create a new canvas
                        options.canvas = undefined;

                        var renderer = new this.options.renderer(backgroundSize.width, backgroundSize.height, null, options, this.document);
                        renderer.renderGradient(gradient, gradientBounds);
                        this.renderBackgroundRepeating(container, bounds, renderer.getImageContainer(), index, borderData);
                    } else {
                        log("Error creating gradient", backgroundImage.args[0]);
                    }
                }
            } else {
                log("Error loading background-image", backgroundImage.args[0]);
            }
            break;
        case "none":
            break;
        default:
            log("Unknown background-image type", backgroundImage.args[0]);
        }
    }, this);
};

Renderer.prototype.renderListStyleImage = function(container, bounds, isOutside) {
    if (!container.listStyleImage) {
        return;
    }

    switch(container.listStyleImage.method) {
    case "url":
        var image = this.images.get(container.listStyleImage.args[0]);
        if (image) {
            var width = image.image && (image.image.naturalWidth || image.image.width);
            var height = image.image && (image.image.naturalHeight || image.image.height);
            this.renderImage(container, {
                left: isOutside ? bounds.left - width - 7 : bounds.left,
                top: bounds.top,
                right: isOutside ? bounds.left - 7 : bounds.left + width,
                bottom: bounds.bottom,
                width: width,
                height: height           
            }, container.borders, image);
        } else {
            log("Error loading background-image", container.listStyleImage.args[0]);
        }
        break;
    case "linear-gradient":
    case "radial-gradient":
    case "repeating-linear-gradient":
    case "repeating-radial-gradient":
    case "gradient":
        var gradientImage = this.images.get(container.listStyleImage.value);
        if (gradientImage) {
            var size = parseInt(container.css("fontSize"), 10) * 0.5;
            var gradientBounds = {
                left: isOutside ? bounds.left - size - 7 : bounds.left,
                top: bounds.bottom - 1.5 * size,
                right: isOutside ? bounds.left - 7 : bounds.left + size,
                bottom: bounds.bottom - 0.5 * size,
                width: size,
                height: size
            };
            var gradient = this.createGradient(container, gradientImage, gradientBounds);
            if (gradient) {
                this.renderGradient(gradient, gradientBounds);
            } else {
                log("Error creating gradient", container.listStyleImage.args[0]);
            }
        } else {
            log("Error loading background-image", container.listStyleImage.args[0]);
        }
        break;
    case "none":
        break;
    default:
        log("Unknown background-image type", container.listStyleImage.args[0]);
    }
};

Renderer.prototype.renderBackgroundRepeating = function(container, bounds, imageContainer, index, borderData) {
    var backgroundBounds = container.parseBackgroundOrigin(bounds, index);
    var size = container.parseBackgroundSize(backgroundBounds, imageContainer.image, index);
    var position = container.parseBackgroundPosition(backgroundBounds, imageContainer.image, index, size);
    var repeat = container.parseBackgroundRepeat(index);
    switch (repeat) {
    case "repeat-x":
    case "repeat no-repeat":
        this.backgroundRepeatShape(imageContainer, position, size, backgroundBounds, backgroundBounds.left + borderData[3], backgroundBounds.top + position.top + borderData[0], 99999, size.height, borderData);
        break;
    case "repeat-y":
    case "no-repeat repeat":
        this.backgroundRepeatShape(imageContainer, position, size, backgroundBounds, backgroundBounds.left + position.left + borderData[3], backgroundBounds.top + borderData[0], size.width, 99999, borderData);
        break;
    case "no-repeat":
        this.backgroundRepeatShape(imageContainer, position, size, backgroundBounds, backgroundBounds.left + position.left + borderData[3], backgroundBounds.top + position.top + borderData[0], size.width, size.height, borderData);
        break;
    default:
        this.renderBackgroundRepeat(imageContainer, position, size, {top: backgroundBounds.top, left: backgroundBounds.left}, borderData[3], borderData[0]);
        break;
    }
};

Renderer.prototype.createGradient = function(container, gradientImage, bounds) {
    if (gradientImage instanceof LinearGradientContainer) {
        return this.createLinearGradient(gradientImage, bounds);
    }
    if (gradientImage instanceof RadialGradientContainer) {
        return this.createRadialGradient(container, gradientImage, bounds);
    }
    if (gradientImage instanceof RepeatingLinearGradientContainer) {
        // TODO
        return undefined;
    }
    if (gradientImage instanceof RepeatingRadialGradientContainer) {
        // TODO
        return undefined;
    }
};

Renderer.prototype.createLinearGradient = function(gradientImage, bounds) {
    // normalize the angle (0 <= alpha < 2π)
    var alpha = gradientImage.angle % (2 * Math.PI);
    if (alpha < 0) {
        alpha += 2 * Math.PI;
    }

    var d = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height);
    var beta = Math.atan2(bounds.height, bounds.width);
    var a, x0, y0, x1, y1;

    if (alpha < Math.PI * 0.5) {
        // (0,h)
        a = d * Math.sin(alpha + beta);
        x0 = bounds.left;
        y0 = bounds.bottom;
        x1 = bounds.left + a * Math.sin(alpha);
        y1 = bounds.bottom - a * Math.cos(alpha);
    } else if (alpha < Math.PI) {
        // (0,0)
        a = d * Math.sin(alpha - beta);
        x0 = bounds.left;
        y0 = bounds.top;
        x1 = bounds.left + a * Math.sin(alpha);
        y1 = bounds.top - a * Math.cos(alpha);
    } else if (alpha < Math.PI * 1.5) {
        // (w,0)
        a = d * Math.sin(alpha + beta);
        x0 = bounds.right;
        y0 = bounds.top;
        x1 = bounds.right - a * Math.sin(alpha);
        y1 = bounds.top + a * Math.cos(alpha);
    } else {
        // (w,h)
        a = d * Math.sin(alpha - beta);
        x0 = bounds.right;
        y0 = bounds.bottom;
        x1 = bounds.right - a * Math.sin(alpha);
        y1 = bounds.bottom + a * Math.cos(alpha);
    }

    return {
        type: gradientImage.type,
        x0: x0,
        y0: y0,
        x1: x1,
        y1: y1,
        colorStops: gradientImage.colorStops
    };
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

Renderer.prototype.createRadialGradient = function(container, gradientImage, bounds) {
    var rx, ry, c, corner;
    var transform = null;

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
        var midX = bounds.left + 0.5 * bounds.width;
        var midY = bounds.top + 0.5 * bounds.height;
        var f = ry / rx;

        transform = {
            matrix: [1, 0, 0, f, 0, 0],
            origin: [midX, midY]
        };

        var invF = 1 / f;
        bounds.top = invF * (bounds.top - midY) + midY;
        bounds.height *= invF;
    }

    return {
        type: gradientImage.type,
        transform: transform,
        cx: x,
        cy: y,
        r: rx,
        colorStops: gradientImage.colorStops
    };
};

module.exports = Renderer;
