/* @flow */
'use strict';

import {calculate, compare} from 'specificity';

declare class CSSStyleRuleWithSpecificity extends CSSStyleRule {
    specificity: Array<number>
}

export const contains = (bit: number, value: number): boolean => (bit & value) !== 0;

export const copyCSSStyles = (style: CSSStyleDeclaration, target: HTMLElement): HTMLElement => {
    // Edge does not provide value for cssText
    for (let i = style.length - 1; i >= 0; i--) {
        const property = style.item(i);
        // Safari shows pseudoelements if content is set
        if (property !== 'content') {
            target.style.setProperty(property, style.getPropertyValue(property));
        }
    }
    return target;
};

const REGEX_PSEUDO_ELEMENTS = /::?(?:after|before|first-line|first-letter)/g;

export const getMatchingRules = (
    element: HTMLElement,
    selectorRegex: RegExp
): Array<CSSStyleRule> => {
    const matchingRules: Array<CSSStyleRule> = [];

    const getMatchingRulesRecursive = (rules: CSSRuleList): void => {
        if (!rules) {
            return;
        }

        const len = rules.length;
        for (let i = 0; i < len; i++) {
            let rule = rules[i];
            switch (rule.type) {
                case 1: // CSSRule.STYLE_RULE
                    try {
                        // $FlowFixMe
                        const styleRule: CSSStyleRule = rule;
                        const selectorText = styleRule.selectorText;

                        if (
                            element.matches(selectorText.replace(/::?[a-zA-Z\-]+/g, '')) &&
                            (!selectorRegex || selectorRegex.test(selectorText))
                        ) {
                            matchingRules.push(styleRule);
                        }
                    } catch (e) {
                        // ignore
                    }
                    break;

                case 3: // CSSRule.IMPORT_RULE
                    // $FlowFixMe
                    getMatchingRulesRecursive(rule.styleSheet.cssRules);
                    break;

                case 4: // CSSRule.MEDIA_RULE
                case 12: // CSSRule.SUPPORTS_RULE
                case 13: // CSSRule.DOCUMENT_RULE
                    // $FlowFixMe
                    getMatchingRulesRecursive(rule.cssRules);
                    break;
            }
        }
    };

    const calculateSpecificity = (rule: CSSStyleRule): Array<number> => {
        const s = calculate(rule.selectorText);
        const len = s.length;

        if (len === 1) {
            return s[0].specificityArray;
        }

        const arr = [];
        for (let i = 0; i < len; i++) {
            if (element.matches(s[i].selector.replace(REGEX_PSEUDO_ELEMENTS, ''))) {
                arr.push(s[i].specificityArray);
            }
        }

        arr.sort(compare);
        return arr[arr.length - 1];
    };

    const lenStyleSheets = element.ownerDocument.styleSheets.length;
    for (let i = 0; i < lenStyleSheets; i++) {
        try {
            // $FlowFixMe
            const styleSheet: CSSStyleSheet = element.ownerDocument.styleSheets[i];
            if (styleSheet && styleSheet.cssRules) {
                getMatchingRulesRecursive(styleSheet.cssRules);
            }
        } catch (e) {
            // ignore
        }
    }

    // $FlowFixMe
    matchingRules.sort((a: CSSStyleRuleWithSpecificity, b: CSSStyleRuleWithSpecificity) => {
        if (a.specificity === undefined) {
            a.specificity = calculateSpecificity(a);
        }
        if (b.specificity === undefined) {
            b.specificity = calculateSpecificity(b);
        }

        return compare(a.specificity, b.specificity);
    });

    return matchingRules;
};

export const SMALL_IMAGE =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
