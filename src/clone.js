var log = require('./log');

function restoreOwnerScroll(ownerDocument, x, y) {
    if (ownerDocument.defaultView && (x !== ownerDocument.defaultView.pageXOffset || y !== ownerDocument.defaultView.pageYOffset)) {
        ownerDocument.defaultView.scrollTo(x, y);
    }
}

function cloneCanvasContents(canvas, clonedCanvas) {
    try {
        if (clonedCanvas) {
            clonedCanvas.width = canvas.width;
            clonedCanvas.height = canvas.height;

            var ctx2d = canvas.getContext("2d");
            if (ctx2d) {
                clonedCanvas.getContext("2d").putImageData(ctx2d.getImageData(0, 0, canvas.width, canvas.height), 0, 0);
            } else {
                clonedCanvas.getContext("2d").drawImage(canvas, 0, 0);
            }
        }
    } catch(e) {
        log("Unable to copy canvas content from", canvas, e);
    }
}

/**
 * Create a <div> to emulate the host element of the shadow DOM
 * and clone the contents of the shadow DOM.
 */
function cloneShadowDOM(node, options) {
    var shadowDiv = document.createElement('div');
    copyComputedStyle(node, shadowDiv);

    var numChildren = node.shadowRoot.children.length;
    for (var i = 0; i < numChildren; i++) {
        var child = node.shadowRoot.children[i];
        if (child.shadowRoot) {
            shadowDiv.appendChild(cloneShadowDOM(child, options));
        } else if (child.nodeName === 'SLOT') {
            shadowDiv.appendChild(cloneSlot(child, node, options));
        } else if (child.nodeType === 1 && !isStyle(child) && child.nodeName !== 'SCRIPT') {
            shadowDiv.appendChild(cloneNode(child, options, node));
        }
    }

    return shadowDiv;
}

function cloneSlot(slot, shadowHost, options) {
    var slotDiv = document.createElement('div');
    copyComputedStyle(slot, slotDiv);

    var child = shadowHost.firstChild;
    while (child) {
        if (options.javascriptEnabled === true || child.nodeType !== 1 || (child.nodeName !== 'SCRIPT' && !isStyle(child))) {
            slotDiv.appendChild(cloneNode(child, options, shadowHost));
        }
        child = child.nextSibling;
    }

    return slotDiv;
}

function isStyle(node) {
    return node.nodeName === 'STYLE' || (node.nodeName === 'LINK' && node.rel && node.rel.toLowerCase() === 'stylesheet');
}

function copyComputedStyle(node, clone) {
    /*
    var style = getComputedStyle(node);
    for (var i = 0; i < style.length; i++) {
        clone.style[style[i]] = style.getPropertyValue(style[i]);
    } //*/
}

function cloneNode(node, options, shadowHost) {
    var clone = node.nodeType === 3 ? document.createTextNode(node.nodeValue) : node.cloneNode(false);

    if (shadowHost && node.nodeType === 1) {
        copyComputedStyle(node, clone);
    }

    var child = node.firstChild;
    while(child) {
        // MCH -->
        if (child.shadowRoot) {
            clone.appendChild(cloneShadowDOM(child, options));
        } else if (shadowHost && child.nodeName === 'SLOT') {
            clone.appendChild(cloneSlot(child, shadowHost, options));
        } else if (options.javascriptEnabled === true || child.nodeType !== 1 || (child.nodeName !== 'SCRIPT' && (!shadowHost || !isStyle(child)))) {
            clone.appendChild(cloneNode(child, options, shadowHost));

            // MCH -->
            // if (child.nodeName === 'SCRIPT' && child.textContent) {
            //     /*jshint -W061 */
            //     console.log('Evaluating script:', child.textContent);
            //     eval(child.textContent);
            // }
            // <--
        }
        // <--

        child = child.nextSibling;
    }

    if (node.nodeType === 1) {
        // MCH: if the clonee is the HTML node, disregard scrolling if we're doing a fullpage screenshot
        if (node.nodeName === "HTML" && options.type !== "view") {
            clone._scrollTop = 0;
            clone._scrollLeft = 0;
        } else {
            clone._scrollTop = node.scrollTop;
            clone._scrollLeft = node.scrollLeft;
        }

        if (node.nodeName === "CANVAS") {
            cloneCanvasContents(node, clone);
        } else if (node.nodeName === "TEXTAREA" || node.nodeName === "SELECT") {
            clone.value = node.value;
        }
    }

    return clone;
}

function initNode(node) {
    if (node.nodeType === 1) {
        node.scrollTop = node._scrollTop;
        node.scrollLeft = node._scrollLeft;

        var child = node.firstChild;
        while(child) {
            initNode(child);
            child = child.nextSibling;
        }
    }
}

module.exports = function(ownerDocument, containerDocument, width, height, options, x ,y) {
    var documentElement = cloneNode(ownerDocument.documentElement, options);
    var container = containerDocument.createElement("iframe");

    container.className = "html2canvas-container";
    container.style.visibility = "hidden";
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0px";
    container.style.border = "0";
    container.style.padding = "0"; // MCH: in case iframe padding is styled in the embedder style sheets
    container.style.width = width + "px";
    container.style.height = height + "px";
    container.width = width;
    container.height = height;
    container.scrolling = "no"; // ios won't scroll without it
    containerDocument.body.appendChild(container);

    return new Promise(function(resolve) {
        var documentClone = container.contentWindow.document;

        /* Chrome doesn't detect relative background-images assigned in inline <style> sheets when fetched through getComputedStyle
         if window url is about:blank, we can assign the url to current by writing onto the document
         */
        container.contentWindow.onload = container.onload = function() {
            var interval = setInterval(function() {
                if (documentClone.body.childNodes.length > 0) {
                    initNode(documentClone.documentElement);
                    clearInterval(interval);

                    // MCH -->
                    // make the "HTML" element the full height of the iframe
                    var html = documentClone.documentElement;
                    if (html && !html.style.height) {
                        html.style.height = "100%";
                    }
                    // <--

                    if (options.type === "view") {
                        container.contentWindow.scrollTo(x, y);
                        if ((/(iPad|iPhone|iPod)/g).test(navigator.userAgent) && (container.contentWindow.scrollY !== y || container.contentWindow.scrollX !== x)) {
                            documentClone.documentElement.style.top = (-y) + "px";
                            documentClone.documentElement.style.left = (-x) + "px";
                            documentClone.documentElement.style.position = 'absolute';
                        }
                    }

                    resolve(container);
                }
            }, 50);
        };

        documentClone.open();
        documentClone.write("<!DOCTYPE html><html></html>");
        // Chrome scrolls the parent document for some reason after the write to the cloned window???
        restoreOwnerScroll(ownerDocument, x, y);
        documentClone.replaceChild(documentClone.adoptNode(documentElement), documentClone.documentElement);
        documentClone.close();
    });
};
