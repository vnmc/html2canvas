/*
  html2canvas 0.5.0-beta4 <http://html2canvas.hertzen.com>
  Copyright (c) 2019 Niklas von Hertzen

  Released under  License
*/

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.html2canvas = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
(function (global){
/*! https://mths.be/punycode v1.4.1 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw new RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * https://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.4.1',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) {
			// in Node.js, io.js, or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else {
			// in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else {
		// in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],2:[function(_dereq_,module,exports){
function toAlphabetic(value, alphabet)
{
    // make the value 0-based, and don't do anything for value <= 0
    --value;
    if (value < 0)
        return null;

    // determine the number of "digits" and the offset for the place-value system
    var lenAlphabet = alphabet.length;
    var numDigits = 1;
    var offset = 0;

    for ( ; ; numDigits++)
    {
        var newOffset = (offset + 1) * lenAlphabet;
        if (value < newOffset)
            break;

        offset = newOffset;
    }

    // use value - offset to convert to a "number" in the place-value system with base lenAlphabet
    value -= offset;
    var ret = '';

    for (var i = 0; i < numDigits; i++)
    {
        ret = alphabet.charAt(value % lenAlphabet) + ret;
        value = Math.floor(value / lenAlphabet);
    }

    return ret;
}

module.exports.toAlphabetic = toAlphabetic;


var ALPHABET = {
    LOWER_LATIN: 'abcdefghijklmnopqrstuvwxyz',
    UPPER_LATIN: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    LOWER_GREEK: 'αβγδεζηθικλμνξοπρστυφχψω',
    UPPER_GREEK: 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ',
    HIRAGANA: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわゐゑをん',
    HIRAGANA_IROHA: 'いろはにほへとちりぬるをわかよたれそつねならむうゐのおくやまけふこえてあさきゆめみしゑひもせす',
    KATAKANA: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヰヱヲン',
    KATAKANA_IROHA: 'イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス'
};

module.exports.ALPHABET = ALPHABET;


module.exports.toLowerLatin = function(value) { return toAlphabetic(value, ALPHABET.LOWER_LATIN); };
module.exports.toUpperLatin = function(value) { return toAlphabetic(value, ALPHABET.UPPER_LATIN); };
module.exports.toLowerGreek = function(value) { return toAlphabetic(value, ALPHABET.LOWER_GREEK); };
module.exports.toUpperGreek = function(value) { return toAlphabetic(value, ALPHABET.UPPER_GREEK); };
module.exports.toHiragana = function(value) { return toAlphabetic(value, ALPHABET.HIRAGANA); };
module.exports.toHiraganaIroha = function(value) { return toAlphabetic(value, ALPHABET.HIRAGANA_IROHA); };
module.exports.toKatakana = function(value) { return toAlphabetic(value, ALPHABET.KATAKANA); };
module.exports.toKatakanaIroha = function(value) { return toAlphabetic(value, ALPHABET.KATAKANA_IROHA); };

},{}],3:[function(_dereq_,module,exports){
function toCJK(value, digits, multipliers, negativeSign, tenHasCoefficient, tenHasCoefficientIfHighNumber, hundredHasCoefficient, usesZero)
{
    if (value <= 0 && !negativeSign)
        return null;

    var val = Math.abs(Math.floor(value));

    if (val === 0)
        return digits.charAt(0);

    var ret = '';
    var maxExponent = multipliers.length;
    var exponent = 0;

    for (var exponent = 0; val > 0 && exponent <= maxExponent; exponent++)
    {
        var coeff = val % 10;

        if (coeff === 0 && usesZero && ret !== '')
            ret = digits.charAt(coeff) + ret;
        else if (coeff > 1 ||
            (coeff === 1 && exponent === 0) ||
            (coeff === 1 && exponent === 1 && tenHasCoefficient) ||
            (coeff === 1 && exponent === 1 && tenHasCoefficientIfHighNumber && value > 100) ||
            (coeff === 1 && exponent > 1 && hundredHasCoefficient))
        {
            ret = digits.charAt(coeff) + (exponent > 0 ? multipliers.charAt(exponent - 1) : '') + ret;
        }
        else if (coeff === 1 && exponent > 0)
            ret = multipliers.charAt(exponent - 1) + ret;

        val = Math.floor(val / 10);
    }

    return (value < 0 ? negativeSign : '') + ret;
};

module.exports.toCJK = toCJK;


var NUMERAL = {
    CJK_IDEOGRAPHIC: {
        DIGITS: '零一二三四五六七八九',
        MULTIPLIERS: '十百千萬',
        NEGATIVE: '負'
    },

    TRAD_CHINESE_INFORMAL: {
        DIGITS: '零一二三四五六七八九',
        MULTIPLIERS: '十百千萬',
        NEGATIVE: '負'
    },

    TRAD_CHINESE_FORMAL: {
        DIGITS: '零壹貳參肆伍陸柒捌玖',
        MULTIPLIERS: '拾佰仟萬',
        NEGATIVE: '負'
    },

    SIMP_CHINESE_INFORMAL: {
        DIGITS: '零一二三四五六七八九',
        MULTIPLIERS: '十百千萬',
        NEGATIVE: '负'
    },

    SIMP_CHINESE_FORMAL: {
        DIGITS: '零壹贰叁肆伍陆柒捌玖',
        MULTIPLIERS: '拾佰仟萬',
        NEGATIVE: '负'
    },

    JAPANESE_INFORMAL: {
        DIGITS: '〇一二三四五六七八九',
        MULTIPLIERS: '十百千万',
        NEGATIVE: 'マイナス'
    },

    JAPANESE_FORMAL: {
        DIGITS: '零壱弐参四伍六七八九',
        MULTIPLIERS: '拾百千万',
        NEGATIVE: 'マイナス'
    },

    KOREAN_HANGUL: {
        DIGITS: '영일이삼사오육칠팔구',
        MULTIPLIERS: '십백천만',
        NEGATIVE: '마이너스'
    },

    KOREAN_HANJA_INFORMAL: {
        DIGITS: '零一二三四五六七八九',
        MULTIPLIERS: '十百千萬',
        NEGATIVE: '마이너스'
    },

    KOREAN_HANJA_FORMAL: {
        //DIGITS: ' 壹貳參肆伍陸柒捌玖',
        DIGITS: '零壹貳參四五六七八九',
        //MULTIPLIERS: '拾佰仟'
        MULTIPLIERS: '拾百千',
        NEGATIVE: '마이너스'
    }
};

module.exports.NUMERAL = NUMERAL;


module.exports.toCJKIdeographic = function(value) { return toCJK(value, NUMERAL.CJK_IDEOGRAPHIC.DIGITS, NUMERAL.CJK_IDEOGRAPHIC.MULTIPLIERS, NUMERAL.CJK_IDEOGRAPHIC.NEGATIVE, false, true, true, true); };
module.exports.toTraditionalChineseInformal = function(value) { return toCJK(value, NUMERAL.TRAD_CHINESE_INFORMAL.DIGITS, NUMERAL.TRAD_CHINESE_INFORMAL.MULTIPLIERS, NUMERAL.TRAD_CHINESE_INFORMAL.NEGATIVE, false, true, true, true); };
module.exports.toTraditionalChineseFormal = function(value) { return toCJK(value, NUMERAL.TRAD_CHINESE_FORMAL.DIGITS, NUMERAL.TRAD_CHINESE_FORMAL.MULTIPLIERS, NUMERAL.TRAD_CHINESE_FORMAL.NEGATIVE, true, true, true, true); };
module.exports.toSimplifiedChineseInformal = function(value) { return toCJK(value, NUMERAL.SIMP_CHINESE_INFORMAL.DIGITS, NUMERAL.SIMP_CHINESE_INFORMAL.MULTIPLIERS, NUMERAL.SIMP_CHINESE_INFORMAL.NEGATIVE, false, true, true, true); };
module.exports.toSimplifiedChineseFormal = function(value) { return toCJK(value, NUMERAL.SIMP_CHINESE_FORMAL.DIGITS, NUMERAL.SIMP_CHINESE_FORMAL.MULTIPLIERS, NUMERAL.SIMP_CHINESE_FORMAL.NEGATIVE, true, true, true, true); };
module.exports.toJapaneseInformal = function(value) { return toCJK(value, NUMERAL.JAPANESE_INFORMAL.DIGITS, NUMERAL.JAPANESE_INFORMAL.MULTIPLIERS, NUMERAL.JAPANESE_INFORMAL.NEGATIVE, false, false, false, false); };
module.exports.toJapaneseFormal = function(value) { return toCJK(value, NUMERAL.JAPANESE_FORMAL.DIGITS, NUMERAL.JAPANESE_FORMAL.MULTIPLIERS, NUMERAL.JAPANESE_FORMAL.NEGATIVE, true, true, true, false); };
module.exports.toKoreanHangul = function(value) { return toCJK(value, NUMERAL.KOREAN_HANGUL.DIGITS, NUMERAL.KOREAN_HANGUL.MULTIPLIERS, NUMERAL.KOREAN_HANGUL.NEGATIVE, true, true, true, false); };
module.exports.toKoreanHanjaInformal = function(value) { return toCJK(value, NUMERAL.KOREAN_HANJA_INFORMAL.DIGITS, NUMERAL.KOREAN_HANJA_INFORMAL.MULTIPLIERS, NUMERAL.KOREAN_HANJA_INFORMAL.NEGATIVE, false, false, false, false); };
module.exports.toKoreanHanjaFormal = function(value) { return toCJK(value, NUMERAL.KOREAN_HANJA_FORMAL.DIGITS, NUMERAL.KOREAN_HANJA_FORMAL.MULTIPLIERS, NUMERAL.KOREAN_HANJA_FORMAL.NEGATIVE, true, true, true, false); };

},{}],4:[function(_dereq_,module,exports){
function toLetterSystem(value, letters)
{
    if (value <= 0)
        return null;

    var ret = '';

    for (var b in letters)
    {
        var num = letters[b];
        var q = Math.floor(value / num);
        value -= q * num;

        for (var i = 0; i < q; i++)
            ret += b;
    }

    return ret;
}

module.exports.toLetterSystem = toLetterSystem;


var LETTER_SYSTEM = {
    ROMAN_UPPER: {
        M: 1000,
        CM: 900,
        D: 500,
        CD: 400,
        C: 100,
        XC: 90,
        L: 50,
        XL: 40,
        X: 10,
        IX: 9,
        V: 5,
        IV: 4,
        I: 1
    },

    ROMAN_LOWER: {
        m: 1000,
        cm: 900,
        d: 500,
        cd: 400,
        c: 100,
        xc: 90,
        l: 50,
        xl: 40,
        x: 10,
        ix: 9,
        v: 5,
        iv: 4,
        i: 1
    },

    HEBREW: {
        'א׳א׳': 1000000,
        'א׳ק': 100000,
        'א׳י': 10000,
        'ט׳': 9000,
        'ח׳': 8000,
        'ז׳': 7000,
        'ו׳': 6000,
        'ה׳': 5000,
        'ד׳': 4000,
        'ג׳': 3000,
        'ב׳': 2000,
        'א׳': 1000,
        'ת': 400,
        'ש': 300,
        'ר': 200,
        'ק': 100,
        'צ': 90,
        'פ': 80,
        'ע': 70,
        'ס': 60,
        'נ': 50,
        'מ‎': 40,
        'ל': 30,
        'כ': 20,
        'טז': 16,
        'טו': 15,
        'י': 10,
        'ט': 9,
        'ח‎': 8,
        'ז': 7,
        'ו': 6,
        'ה': 5,
        'ד': 4,
        'ג': 3,
        'ב': 2,
        'א': 1
    },

    GEORGIAN: {
        'ჵ': 10000,
        'ჰ': 9000,
        'ჯ': 8000,
        'ჴ': 7000,
        'ხ': 6000,
        'ჭ': 5000,
        'წ': 4000,
        'ძ': 3000,
        'ც': 2000,
        'ჩ': 1000,
        'შ': 900,
        'ყ': 800,
        'ღ': 700,
        'ქ': 600,
        'ფ': 500,
        'ჳ': 400,
        'ტ': 300,
        'ს': 200,
        'რ': 100,
        'ჟ': 90,
        'პ': 80,
        'ო': 70,
        'ჲ': 60,
        'ნ': 50,
        'მ': 40,
        'ლ': 30,
        'კ': 20,
        'ი': 10,
        'თ': 9,
        'ჱ': 8,
        'ზ': 7,
        'ვ': 6,
        'ე': 5,
        'დ': 4,
        'გ': 3,
        'ბ': 2,
        'ა': 1
    },

    ARMENIAN_UPPER: {
        'Ք': 9000,
        'Փ': 8000,
        'Ւ': 7000,
        'Ց': 6000,
        'Ր': 5000,
        'Տ': 4000,
        'Վ': 3000,
        'Ս': 2000,
        'Ռ': 1000,
        'Ջ': 900,
        'Պ': 800,
        'Չ': 700,
        'Ո': 600,
        'Շ': 500,
        'Ն': 400,
        'Յ': 300,
        'Մ': 200,
        'Ճ': 100,
        'Ղ': 90,
        'Ձ': 80,
        'Հ': 70,
        'Կ': 60,
        'Ծ': 50,
        'Խ': 40,
        'Լ': 30,
        'Ի': 20,
        'Ժ': 10,
        'Թ': 9,
        'Ը': 8,
        'Է': 7,
        'Զ': 6,
        'Ե': 5,
        'Դ': 4,
        'Գ': 3,
        'Բ': 2,
        'Ա': 1
    },

    ARMENIAN_LOWER: {
        'ք': 9000,
        'փ': 8000,
        'ւ': 7000,
        'ց': 6000,
        'ր': 5000,
        'տ': 4000,
        'վ': 3000,
        'ս': 2000,
        'ռ': 1000,
        'ջ': 900,
        'պ': 800,
        'չ': 700,
        'ո': 600,
        'շ': 500,
        'ն': 400,
        'յ': 300,
        'մ': 200,
        'ճ': 100,
        'ղ': 90,
        'ձ': 80,
        'հ': 70,
        'կ': 60,
        'ծ': 50,
        'խ': 40,
        'լ': 30,
        'ի': 20,
        'ժ': 10,
        'թ': 9,
        'ը': 8,
        'է': 7,
        'զ': 6,
        'ե': 5,
        'դ': 4,
        'գ': 3,
        'բ': 2,
        'ա': 1
    }
};

module.exports.LETTER_SYSTEM = LETTER_SYSTEM;


module.exports.toUpperRoman = function(value) { return toLetterSystem(value, LETTER_SYSTEM.ROMAN_UPPER); };
module.exports.toLowerRoman = function(value) { return toLetterSystem(value, LETTER_SYSTEM.ROMAN_LOWER); };
module.exports.toHebrew = function(value) { return toLetterSystem(value, LETTER_SYSTEM.HEBREW); };
module.exports.toGeorgian = function(value) { return toLetterSystem(value, LETTER_SYSTEM.GEORGIAN); };
module.exports.toUpperArmenian = function(value) { return toLetterSystem(value, LETTER_SYSTEM.ARMENIAN_UPPER); };
module.exports.toLowerArmenian = function(value) { return toLetterSystem(value, LETTER_SYSTEM.ARMENIAN_LOWER); };

},{}],5:[function(_dereq_,module,exports){
function toPlaceValue(value, digits, hasNegativeNumbers, minusSign)
{
    if (hasNegativeNumbers === false && value < 0)
        return null;

    if (!minusSign)
        minusSign = '-';

    var sign = '';
    if (value < 0)
        sign = minusSign;

    if (-1 < value && value < 1)
        return sign + digits.charAt(0);

    var ret = '';
    var numDigits = digits.length;
    value = Math.abs(value);

    while (value)
    {
        ret = digits.charAt(value % numDigits) + ret;
        value = Math.floor(value / numDigits);
    }

    return sign + ret;
};

module.exports.toPlaceValue = toPlaceValue;


function toOneBasedPlaceValue(value, digits)
{
    if (value <= 0)
        return null;

    var ret = '';
    var numDigits = digits.length;

    while (value)
    {
        var v = value % numDigits;
        ret = digits.charAt(v === 0 ? numDigits - 1 : v - 1) + ret;
        value = Math.floor(value / numDigits) - (v === 0 ? 1 : 0);
    }

    return ret;
};


var DIGITS = {
    ARABIC_INDIC: '٠١٢٣٤٥٦٧٨٩',
    BENGALI: '০১২৩৪৫৬৭৮৯',
    CJK_DECIMAL: '〇一二三四五六七八九',
    CJK_EARTHLY_BRANCH: '子丑寅卯辰巳午未申酉戌亥',
    CJK_HEAVENLY_STEM: '甲乙丙丁戊己庚辛壬癸',
    DEVANAGARI: '०१२३४५६७८९',
    GUJARATI: '૦૧૨૩૪૫૬૭૮૯',
    GURMUKHI: '੦੧੨੩੪੫੬੭੮੯',
    KANNADA: '೦೧೨೩೪೫೬೭೮೯',
    KHMER: '០១២៣៤៥៦៧៨៩',
    LAO: '໐໑໒໓໔໕໖໗໘໙',
    MALAYALAM: '൦൧൨൩൪൫൬൭൮൯',
    MONGILIAN: '᠐᠑᠒᠓᠔᠕᠖᠗᠘᠙',
    MYANMAR: '၀၁၂၃၄၅၆၇၈၉',
    ORIYA: '୦୧୨୩୪୫୬୭୮୯',
    PERSIAN: '۰۱۲۳۴۵۶۷۸۹',
    TAMIL: '௦௧௨௩௪௫௬௭௮௯',
    TELUGU: '౦౧౨౩౪౫౬౭౮౯',
    THAI: '๐๑๒๓๔๕๖๗๘๙',
    TIBETAN: '༠༡༢༣༤༥༦༧༨༩'
};

module.exports.DIGITS = DIGITS;


module.exports.toArabicIndic = function(v) { return toPlaceValue(v, DIGITS.ARABIC_INDIC); };
module.exports.toBengali = function(v) { return toPlaceValue(v, DIGITS.BENGALI); };
module.exports.toCJKDecimal = function(v) { return toPlaceValue(v, DIGITS.CJK_DECIMAL, false); };
module.exports.toCJKEarthlyBranch = function(v) { return toOneBasedPlaceValue(v, DIGITS.CJK_EARTHLY_BRANCH); };
module.exports.toCJKHeavenlyStem = function(v) { return toOneBasedPlaceValue(v, DIGITS.CJK_HEAVENLY_STEM); };
module.exports.toDevanagari = function(v) { return toPlaceValue(v, DIGITS.DEVANAGARI); };
module.exports.toGujarati = function(v) { return toPlaceValue(v, DIGITS.GUJARATI); };
module.exports.toGurmukhi = function(v) { return toPlaceValue(v, DIGITS.GURMUKHI); };
module.exports.toKannada = function(v) { return toPlaceValue(v, DIGITS.KANNADA); };
module.exports.toKhmer = function(v) { return toPlaceValue(v, DIGITS.KHMER); };
module.exports.toLao = function(v) { return toPlaceValue(v, DIGITS.LAO); };
module.exports.toMalayalam = function(v) { return toPlaceValue(v, DIGITS.MALAYALAM); };
module.exports.toMongolian = function(v) { return toPlaceValue(v, DIGITS.MONGILIAN); };
module.exports.toMyanmar = function(v) { return toPlaceValue(v, DIGITS.MYANMAR); };
module.exports.toOriya = function(v) { return toPlaceValue(v, DIGITS.ORIYA); };
module.exports.toPersian = function(v) { return toPlaceValue(v, DIGITS.PERSIAN); };
module.exports.toTamil = function(v) { return toPlaceValue(v, DIGITS.TAMIL); };
module.exports.toTelugu = function(v) { return toPlaceValue(v, DIGITS.TELUGU); };
module.exports.toThai = function(v) { return toPlaceValue(v, DIGITS.THAI); };
module.exports.toTibetan = function(v) { return toPlaceValue(v, DIGITS.TIBETAN); };

},{}],6:[function(_dereq_,module,exports){
/**
 * http://www.geez.org/Numerals/
 * http://metaappz.com/Geez_Numbers_Converter/Default.aspx
 */
module.exports.toEthiopic = function(value)
{
    if (value <= 0)
        return null;

    var ONES = '፩፪፫፬፭፮፯፰፱';
    var TENS = '፲፳፴፵፶፷፸፹፺';
    var HUNDRED = '፻';
    var TENTHOUSAND = '፼';

    var ret = '';
    var sep = '';

    value = Math.floor(value);

    for (var i = 0; value > 0; i++)
    {
        var one = value % 10;
        var ten = Math.floor(value / 10) % 10;

        if ((one === 1 && ten === 0 && i > 0) || (one === 0 && ten === 0 && i > 1))
            ret = sep + ret;
        else if (one > 0 || ten > 0)
        {
            ret =
                (ten > 0 ? TENS.charAt(ten - 1) : '') +
                (one > 0 ? ONES.charAt(one - 1) : '') +
                sep + ret;
        }

        value = Math.floor(value / 100);
        sep = i % 2 ? TENTHOUSAND : HUNDRED;
    }

    return ret;
};

},{}],7:[function(_dereq_,module,exports){
///////////////////////////////////////////////////////////////////////////////
// Import Packages

var Alpha = _dereq_('./converters/alpha');
var Letter = _dereq_('./converters/letter');
var PlaceValue = _dereq_('./converters/placevalue');
var CJK = _dereq_('./converters/cjk');
var Special = _dereq_('./converters/special');


///////////////////////////////////////////////////////////////////////////////
// Private Functions

function addDot(s, dot)
{
    if (dot === undefined)
        dot = '.';
    return s === null ? s : s + dot;
}


///////////////////////////////////////////////////////////////////////////////
// Module Constants

// formatter specifications
var formatters = {
    'none': '',
    'disc': '•',
    'circle': '◦',
    'square': '￭',

    'decimal': Math.floor,
    'cjk-decimal': { function: PlaceValue.toCJKDecimal, dot: '、' },

    'decimal-leading-zero': function(v)
    {
        v = Math.floor(v);
        if (0 <= v && v < 10)
            return '0' + v;
        if (-10 < v && v < 0)
            return '-0' + Math.abs(v);
        return v;
    },

    'lower-roman': Letter.toLowerRoman,
    'upper-roman': Letter.toUpperRoman,
    'lower-greek': Alpha.toLowerGreek,
    'lower-alpha': Alpha.toLowerLatin,
    'upper-alpha': Alpha.toUpperLatin,
    'arabic-indic': PlaceValue.toArabicIndic,
    'armenian': Letter.toUpperArmenian,
    'bengali': PlaceValue.toBengali,
    'cambodian': PlaceValue.toKhmer,
    'cjk-earthly-branch': { function: PlaceValue.toCJKEarthlyBranch, dot: '、' },
    'cjk-heavenly-stem': { function: PlaceValue.toCJKHeavenlyStem, dot: '、' },
    'cjk-ideographic': { function: CJK.toCJKIdeographic, dot: '、' },
    'devanagari': PlaceValue.toDevanagari,
    'ethiopic-numeric': { function: Special.toEthiopic, dot: '' },
    'georgian': Letter.toGeorgian,
    'gujarati': PlaceValue.toGujarati,
    'gurmukhi': PlaceValue.toGurmukhi,
    'hebrew': Letter.toHebrew,
    'hiragana': Alpha.toHiragana,
    'hiragana-iroha': Alpha.toHiraganaIroha,
    'japanese-formal': { function: CJK.toJapaneseFormal, dot: '、' },
    'japanese-informal': { function: CJK.toJapaneseInformal, dot: '、' },
    'kannada': PlaceValue.toKannada,
    'katakana': Alpha.toKatakana,
    'katakana-iroha': Alpha.toKatakanaIroha,
    'khmer': PlaceValue.toKhmer,
    'korean-hangul-formal': { function: CJK.toKoreanHangul, dot: '、' },
    'korean-hanja-formal': { function: CJK.toKoreanHanjaFormal, dot: '、' },
    'korean-hanja-informal': { function: CJK.toKoreanHanjaInformal, dot: '、' },
    'lao': PlaceValue.toLao,
    'lower-armenian': Letter.toLowerArmenian,
    'malayalam': PlaceValue.toMalayalam,
    'mongolian': PlaceValue.toMongolian,
    'myanmar': PlaceValue.toMyanmar,
    'oriya': PlaceValue.toOriya,
    'persian': PlaceValue.toPersian,
    'simp-chinese-formal': { function: CJK.toSimplifiedChineseFormal, dot: '、' },
    'simp-chinese-informal': { function: CJK.toSimplifiedChineseInformal, dot: '、' },
    'tamil': PlaceValue.toTamil,
    'telugu': PlaceValue.toTelugu,
    'thai': PlaceValue.toThai,
    'tibetan': PlaceValue.toTibetan,
    'trad-chinese-formal': { function: CJK.toTraditionalChineseFormal, dot: '、' },
    'trad-chinese-informal': { function: CJK.toTraditionalChineseInformal, dot: '、' },
    'upper-armenian': Letter.toUpperArmenian
};

// define aliases
formatters['lower-latin'] = formatters['lower-alpha'];
formatters['upper-latin'] = formatters['upper-alpha'];
formatters['-moz-arabic-indic'] = formatters['arabic-indic'];
formatters['-moz-bengali'] = formatters['bengali'];
formatters['-moz-cjk-earthly-branch'] = formatters['cjk-earthly-branch'];
formatters['-moz-cjk-heavenly-stem'] = formatters['cjk-heavenly-stem'];
formatters['-moz-devanagari'] = formatters['devanagari'];
formatters['-moz-gujarati'] = formatters['gujarati'];
formatters['-moz-gurmukhi'] = formatters['gurmukhi'];
formatters['-moz-kannada'] = formatters['kannada'];
formatters['-moz-khmer'] = formatters['khmer'];
formatters['-moz-lao'] = formatters['lao'];
formatters['-moz-malayalam'] = formatters['malayalam'];
formatters['-moz-myanmar'] = formatters['myanmar'];
formatters['-moz-oriya'] = formatters['oriya'];
formatters['-moz-persian'] = formatters['persian'];
formatters['-moz-tamil'] = formatters['tamil'];
formatters['-moz-telugu'] = formatters['telugu'];
formatters['-moz-thai'] = formatters['thai'];

// set the default formatter
var defaultFormatter = formatters.decimal;


///////////////////////////////////////////////////////////////////////////////
// Implementation

function formatInternal(value, formatter, appendDot)
{
    switch (typeof formatter)
    {
    case 'function':
        return appendDot ?
            addDot(formatter(value)) :
            formatter(value);

    case 'object':
        return appendDot ?
            addDot(formatter.function(value), formatter.dot) :
            formatter.function(value);

    case 'string':
        return formatter;
    }

    return undefined;
}

/**
 * Formats the number "value" according to the CSS list-style-type format "format".
 * https://developer.mozilla.org/en/docs/Web/CSS/list-style-type
 *
 * @param value
 *    The number to format
 *
 * @param format
 *    The format string to use, the ones listed here:
 *    https://developer.mozilla.org/en/docs/Web/CSS/list-style-type
 *
 * @param appendDot
 *    Optional flag indicating if an enumeration symbol (typically, a dot) is to be
 *    appended to the formatted number.
 *    Defaults to true.
 */
module.exports.format = function(value, format, appendDot /* optional */)
{
    if (appendDot === undefined)
        appendDot = true;

    var ret = formatInternal(
        value,
        format in formatters ? formatters[format] : defaultFormatter,
        appendDot
    );

    return (ret === null || ret === undefined) ?
        formatInternal(value, defaultFormatter, appendDot) :
        ret;
};


/**
 * Export a global object in the browser.
 */
if (typeof window !== 'undefined')
{    
    window.ListStyleTypeFormatter = {
        format: module.exports.format
    };
}

},{"./converters/alpha":2,"./converters/cjk":3,"./converters/letter":4,"./converters/placevalue":5,"./converters/special":6}],8:[function(_dereq_,module,exports){
/* global Areion: true */

function ProxyImageContainer(src, proxy) {
    var self = this;
    this.src = src;
    this.image = new Image();
    this.tainted = null;

    this.promise = new Promise(function(resolve, reject) {
        self.image.onload = resolve;
        self.image.onerror = reject;

        self.image.src = Areion.rewriteUrl(src);

        if (self.image.complete === true) {
            resolve(self.image);
        }
    });
}

module.exports = ProxyImageContainer;

},{}],9:[function(_dereq_,module,exports){
/* global Areion: true */

function ProxyVideoContainer(imageData) {
    var video = imageData.args[0];
    this.src = video.currentSrc || video.src;

    // Adding index to identify the video element as <video> can have multiple child <source>.
    this.videoIndex = imageData.videoIndex;
    video.videoIndex = imageData.videoIndex;
    this.image = video;

    video.src = Areion.rewriteUrl(this.src);

    this.promise = new Promise(function(resolve, reject) {
        video.muted = true;
        var originalVideos = document.getElementsByTagName('video');

        if (originalVideos.length !== 0 && originalVideos[imageData.videoIndex]) {
            var originalVideo = originalVideos[imageData.videoIndex];
            if (originalVideo.currentTime) {
                video.currentTime = originalVideo.currentTime;
            }

            if (!video.paused) {
                resolve();
            } else {
                var playPromise = video.play();
                if (playPromise) {
                    playPromise.then(resolve, reject);
                } else {
                    resolve();
                }
            }
        } else {
            resolve();
        }
    });
}

module.exports = ProxyVideoContainer;

},{}],10:[function(_dereq_,module,exports){
var log = _dereq_('./log');

function escapeCSS(value) {
    if (window.CSS && typeof CSS.escape === 'function') {
        return CSS.escape(value);
    }

    // https://github.com/mathiasbynens/CSS.escape/blob/master/css.escape.js
    if (arguments.length === 0) {
        throw new TypeError('`escapeCSS` requires an argument.');
    }
    var string = String(value);
    var length = string.length;
    var index = -1;
    var codeUnit;
    var result = '';
    var firstCodeUnit = string.charCodeAt(0);
    while (++index < length) {
        codeUnit = string.charCodeAt(index);
        // Note: there’s no need to special-case astral symbols, surrogate
        // pairs, or lone surrogates.

        // If the character is NULL (U+0000), then the REPLACEMENT CHARACTER
        // (U+FFFD).
        if (codeUnit === 0x0000) {
            result += '\uFFFD';
            continue;
        }

        if (
            // If the character is in the range [\1-\1F] (U+0001 to U+001F) or is
            // U+007F, […]
            (codeUnit >= 0x0001 && codeUnit <= 0x001F) || codeUnit === 0x007F ||
            // If the character is the first character and is in the range [0-9]
            // (U+0030 to U+0039), […]
            (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
            // If the character is the second character and is in the range [0-9]
            // (U+0030 to U+0039) and the first character is a `-` (U+002D), […]
            (
                index === 1 &&
                codeUnit >= 0x0030 && codeUnit <= 0x0039 &&
                firstCodeUnit === 0x002D
            )
        ) {
            // https://drafts.csswg.org/cssom/#escape-a-character-as-code-point
            result += '\\' + codeUnit.toString(16) + ' ';
            continue;
        }

        if (
            // If the character is the first character and is a `-` (U+002D), and
            // there is no second character, […]
            index === 0 &&
            length === 1 &&
            codeUnit === 0x002D
        ) {
            result += '\\' + string.charAt(index);
            continue;
        }

        // If the character is not handled by one of the above rules and is
        // greater than or equal to U+0080, is `-` (U+002D) or `_` (U+005F), or
        // is in one of the ranges [0-9] (U+0030 to U+0039), [A-Z] (U+0041 to
        // U+005A), or [a-z] (U+0061 to U+007A), […]
        if (
            codeUnit >= 0x0080 ||
            codeUnit === 0x002D ||
            codeUnit === 0x005F ||
            codeUnit >= 0x0030 && codeUnit <= 0x0039 ||
            codeUnit >= 0x0041 && codeUnit <= 0x005A ||
            codeUnit >= 0x0061 && codeUnit <= 0x007A
        ) {
            // the character itself
            result += string.charAt(index);
            continue;
        }

        // Otherwise, the escaped character.
        // https://drafts.csswg.org/cssom/#escape-a-character
        result += '\\' + string.charAt(index);
    }

    return result;
}

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
    var slotReplacement = document.createElement('span');
    copyComputedStyle(slot, slotReplacement);

    /*
    if (slot.name) {
        // named slot; clone the element with the given slot name
        var slotNodes = shadowHost.querySelectorAll('[slot="' + escapeCSS(slot.name) + '"]');
        var numSlotNodes = slotNodes.length;
        for (var i = 0; i < numSlotNodes; i++) {
            slotReplacement.appendChild(cloneNode(slotNodes[i], options, shadowHost));
        }
    } else {
        // unnamed slot; copy the entire contents of the shadow host
        var child = shadowHost.firstChild;
        while (child) {
            if (options.javascriptEnabled === true || child.nodeType !== 1 || (child.nodeName !== 'SCRIPT' && !isStyle(child) && !child.slot)) {
                slotReplacement.appendChild(cloneNode(child, options, shadowHost));
            }
            child = child.nextSibling;
        }
    }*/

    var slotNodes = typeof slot.assignedNodes === 'function' ? slot.assignedNodes() : [];
    var numSlotNodes = slotNodes.length;
    for (var i = 0; i < numSlotNodes; i++) {
        slotReplacement.appendChild(cloneNode(slotNodes[i], options, shadowHost));
    }

    return slotReplacement;
}

function isStyle(node) {
    return node.nodeName === 'STYLE' || (node.nodeName === 'LINK' && node.rel && node.rel.toLowerCase() === 'stylesheet');
}

function copyComputedStyle(node, clone) {
    //*
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

},{"./log":21}],11:[function(_dereq_,module,exports){
// http://dev.w3.org/csswg/css-color/

function Color(value) {
    this.r = 0;
    this.g = 0;
    this.b = 0;
    this.a = null;
    var result = this.fromArray(value) ||
        this.namedColor(value) ||
        this.rgb(value) ||
        this.rgba(value) ||
        this.hsl(value) ||
        this.hsla(value) ||
        this.hex6(value) ||
        this.hex3(value);
}

Color.prototype.darken = function(amount) {
    var a = 1 - amount;
    return  new Color([
        Math.round(this.r * a),
        Math.round(this.g * a),
        Math.round(this.b * a),
        this.a
    ]);
};

Color.prototype.isTransparent = function() {
    return this.a === 0;
};

Color.prototype.isBlack = function() {
    return this.r === 0 && this.g === 0 && this.b === 0;
};

Color.prototype.fromArray = function(array) {
    if (Array.isArray(array)) {
        this.r = Math.min(array[0], 255);
        this.g = Math.min(array[1], 255);
        this.b = Math.min(array[2], 255);
        if (array.length > 3) {
            this.a = array[3];
        }
    }

    return (Array.isArray(array));
};

var _hex3 = /^#([a-f0-9]{3})$/i;

Color.prototype.hex3 = function(value) {
    var match = null;
    if ((match = value.match(_hex3)) !== null) {
        this.r = parseInt(match[1][0] + match[1][0], 16);
        this.g = parseInt(match[1][1] + match[1][1], 16);
        this.b = parseInt(match[1][2] + match[1][2], 16);
    }
    return match !== null;
};

var _hex6 = /^#([a-f0-9]{6})$/i;

Color.prototype.hex6 = function(value) {
    var match = null;
    if ((match = value.match(_hex6)) !== null) {
        this.r = parseInt(match[1].substring(0, 2), 16);
        this.g = parseInt(match[1].substring(2, 4), 16);
        this.b = parseInt(match[1].substring(4, 6), 16);
    }
    return match !== null;
};


var _rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;

Color.prototype.rgb = function(value) {
    var match = null;
    if ((match = value.match(_rgb)) !== null) {
        this.r = Number(match[1]);
        this.g = Number(match[2]);
        this.b = Number(match[3]);
    }
    return match !== null;
};

var _rgba = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d?\.?\d+)\s*\)$/;

Color.prototype.rgba = function(value) {
    var match = null;
    if ((match = value.match(_rgba)) !== null) {
        this.r = Number(match[1]);
        this.g = Number(match[2]);
        this.b = Number(match[3]);
        this.a = Number(match[4]);
    }
    return match !== null;
};

var _hsl = /^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/;

Color.prototype.hsl = function(value) {
    var match = null;
    if ((match = value.match(_hsl)) !== null) {
        var rgb = Color.hsl2rgb(Number(match[1]), Number(match[2]), Number(match[3]));
        this.r = rgb.r;
        this.g = rgb.g;
        this.b = rgb.b;
    }
    return match !== null;
};

var _hsla = /^hsla\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*,\s*(\d?\.?\d+)\s*\)$/;

Color.prototype.hsla = function(value) {
    var match = null;
    if ((match = value.match(_hsla)) !== null) {
        var rgb = Color.hsl2rgb(Number(match[1]), Number(match[2]), Number(match[3]));
        this.r = rgb.r;
        this.g = rgb.g;
        this.b = rgb.b;
        this.a = Number(match[4]);
    }
    return match !== null;
};

Color.prototype.toString = function() {
    return this.a !== null && this.a !== 1 ?
    "rgba(" + [this.r, this.g, this.b, this.a].join(",") + ")" :
    "rgb(" + [this.r, this.g, this.b].join(",") + ")";
};

Color.prototype.namedColor = function(value) {
    value = value.toLowerCase();
    var color = colors[value];
    if (color) {
        this.r = color[0];
        this.g = color[1];
        this.b = color[2];
    } else if (value === "transparent") {
        this.r = this.g = this.b = this.a = 0;
        return true;
    }

    return !!color;
};

Color.hsl2rgb = function(h, s, l) {
    var r, g, b;

    if (!isFinite(h)) {
        h = 0;
    }
    if (!isFinite(s)) {
        s = 0;
    }
    if (!isFinite(l)) {
        l = 0;
    }

    h /= 60;
    if (h < 0) {
        h = 6 - (-h % 6);
    }
    h %= 6;

    s = Math.max(0, Math.min(1, s / 100));
    l = Math.max(0, Math.min(1, l / 100));

    var c = (1 - Math.abs((2 * l) - 1)) * s;
    var x = c * (1 - Math.abs((h % 2) - 1));

    if (h < 1) {
        r = c;
        g = x;
        b = 0;
    } else if (h < 2) {
        r = x;
        g = c;
        b = 0;
    } else if (h < 3) {
        r = 0;
        g = c;
        b = x;
    } else if (h < 4) {
        r = 0;
        g = x;
        b = c;
    } else if (h < 5) {
        r = x;
        g = 0;
        b = c;
    } else {
        r = c;
        g = 0;
        b = x;
    }

    var m = l - c / 2;
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return { r: r, g: g, b: b };
};

Color.prototype.isColor = true;

// JSON.stringify([].slice.call($$('.named-color-table tr'), 1).map(function(row) { return [row.childNodes[3].textContent, row.childNodes[5].textContent.trim().split(",").map(Number)] }).reduce(function(data, row) {data[row[0]] = row[1]; return data}, {}))
var colors = {
    "aliceblue": [240, 248, 255],
    "antiquewhite": [250, 235, 215],
    "aqua": [0, 255, 255],
    "aquamarine": [127, 255, 212],
    "azure": [240, 255, 255],
    "beige": [245, 245, 220],
    "bisque": [255, 228, 196],
    "black": [0, 0, 0],
    "blanchedalmond": [255, 235, 205],
    "blue": [0, 0, 255],
    "blueviolet": [138, 43, 226],
    "brown": [165, 42, 42],
    "burlywood": [222, 184, 135],
    "cadetblue": [95, 158, 160],
    "chartreuse": [127, 255, 0],
    "chocolate": [210, 105, 30],
    "coral": [255, 127, 80],
    "cornflowerblue": [100, 149, 237],
    "cornsilk": [255, 248, 220],
    "crimson": [220, 20, 60],
    "cyan": [0, 255, 255],
    "darkblue": [0, 0, 139],
    "darkcyan": [0, 139, 139],
    "darkgoldenrod": [184, 134, 11],
    "darkgray": [169, 169, 169],
    "darkgreen": [0, 100, 0],
    "darkgrey": [169, 169, 169],
    "darkkhaki": [189, 183, 107],
    "darkmagenta": [139, 0, 139],
    "darkolivegreen": [85, 107, 47],
    "darkorange": [255, 140, 0],
    "darkorchid": [153, 50, 204],
    "darkred": [139, 0, 0],
    "darksalmon": [233, 150, 122],
    "darkseagreen": [143, 188, 143],
    "darkslateblue": [72, 61, 139],
    "darkslategray": [47, 79, 79],
    "darkslategrey": [47, 79, 79],
    "darkturquoise": [0, 206, 209],
    "darkviolet": [148, 0, 211],
    "deeppink": [255, 20, 147],
    "deepskyblue": [0, 191, 255],
    "dimgray": [105, 105, 105],
    "dimgrey": [105, 105, 105],
    "dodgerblue": [30, 144, 255],
    "firebrick": [178, 34, 34],
    "floralwhite": [255, 250, 240],
    "forestgreen": [34, 139, 34],
    "fuchsia": [255, 0, 255],
    "gainsboro": [220, 220, 220],
    "ghostwhite": [248, 248, 255],
    "gold": [255, 215, 0],
    "goldenrod": [218, 165, 32],
    "gray": [128, 128, 128],
    "green": [0, 128, 0],
    "greenyellow": [173, 255, 47],
    "grey": [128, 128, 128],
    "honeydew": [240, 255, 240],
    "hotpink": [255, 105, 180],
    "indianred": [205, 92, 92],
    "indigo": [75, 0, 130],
    "ivory": [255, 255, 240],
    "khaki": [240, 230, 140],
    "lavender": [230, 230, 250],
    "lavenderblush": [255, 240, 245],
    "lawngreen": [124, 252, 0],
    "lemonchiffon": [255, 250, 205],
    "lightblue": [173, 216, 230],
    "lightcoral": [240, 128, 128],
    "lightcyan": [224, 255, 255],
    "lightgoldenrodyellow": [250, 250, 210],
    "lightgray": [211, 211, 211],
    "lightgreen": [144, 238, 144],
    "lightgrey": [211, 211, 211],
    "lightpink": [255, 182, 193],
    "lightsalmon": [255, 160, 122],
    "lightseagreen": [32, 178, 170],
    "lightskyblue": [135, 206, 250],
    "lightslategray": [119, 136, 153],
    "lightslategrey": [119, 136, 153],
    "lightsteelblue": [176, 196, 222],
    "lightyellow": [255, 255, 224],
    "lime": [0, 255, 0],
    "limegreen": [50, 205, 50],
    "linen": [250, 240, 230],
    "magenta": [255, 0, 255],
    "maroon": [128, 0, 0],
    "mediumaquamarine": [102, 205, 170],
    "mediumblue": [0, 0, 205],
    "mediumorchid": [186, 85, 211],
    "mediumpurple": [147, 112, 219],
    "mediumseagreen": [60, 179, 113],
    "mediumslateblue": [123, 104, 238],
    "mediumspringgreen": [0, 250, 154],
    "mediumturquoise": [72, 209, 204],
    "mediumvioletred": [199, 21, 133],
    "midnightblue": [25, 25, 112],
    "mintcream": [245, 255, 250],
    "mistyrose": [255, 228, 225],
    "moccasin": [255, 228, 181],
    "navajowhite": [255, 222, 173],
    "navy": [0, 0, 128],
    "oldlace": [253, 245, 230],
    "olive": [128, 128, 0],
    "olivedrab": [107, 142, 35],
    "orange": [255, 165, 0],
    "orangered": [255, 69, 0],
    "orchid": [218, 112, 214],
    "palegoldenrod": [238, 232, 170],
    "palegreen": [152, 251, 152],
    "paleturquoise": [175, 238, 238],
    "palevioletred": [219, 112, 147],
    "papayawhip": [255, 239, 213],
    "peachpuff": [255, 218, 185],
    "peru": [205, 133, 63],
    "pink": [255, 192, 203],
    "plum": [221, 160, 221],
    "powderblue": [176, 224, 230],
    "purple": [128, 0, 128],
    "rebeccapurple": [102, 51, 153],
    "red": [255, 0, 0],
    "rosybrown": [188, 143, 143],
    "royalblue": [65, 105, 225],
    "saddlebrown": [139, 69, 19],
    "salmon": [250, 128, 114],
    "sandybrown": [244, 164, 96],
    "seagreen": [46, 139, 87],
    "seashell": [255, 245, 238],
    "sienna": [160, 82, 45],
    "silver": [192, 192, 192],
    "skyblue": [135, 206, 235],
    "slateblue": [106, 90, 205],
    "slategray": [112, 128, 144],
    "slategrey": [112, 128, 144],
    "snow": [255, 250, 250],
    "springgreen": [0, 255, 127],
    "steelblue": [70, 130, 180],
    "tan": [210, 180, 140],
    "teal": [0, 128, 128],
    "thistle": [216, 191, 216],
    "tomato": [255, 99, 71],
    "turquoise": [64, 224, 208],
    "violet": [238, 130, 238],
    "wheat": [245, 222, 179],
    "white": [255, 255, 255],
    "whitesmoke": [245, 245, 245],
    "yellow": [255, 255, 0],
    "yellowgreen": [154, 205, 50]
};

module.exports = Color;

},{}],12:[function(_dereq_,module,exports){
var Support = _dereq_('./support');
var CanvasRenderer = _dereq_('./renderers/canvas');
var ImageLoader = _dereq_('./imageloader');
var NodeParser = _dereq_('./nodeparser');
var NodeContainer = _dereq_('./nodecontainer');
var log = _dereq_('./log');
var utils = _dereq_('./utils');
var createWindowClone = _dereq_('./clone');
var loadUrlDocument = _dereq_('./proxy').loadUrlDocument;
var getBounds = utils.getBounds;

var html2canvasNodeAttribute = "data-html2canvas-node";
var html2canvasCloneIndex = 0;

function html2canvas(nodeList, options) {
    var index = html2canvasCloneIndex++;
    options = options || {};
    if (options.logging) {
        log.options.logging = true;
        log.options.start = Date.now();
    }

    options.async = typeof(options.async) === "undefined" ? true : options.async;
    options.allowTaint = typeof(options.allowTaint) === "undefined" ? false : options.allowTaint;
    options.removeContainer = typeof(options.removeContainer) === "undefined" ? true : options.removeContainer;
    options.javascriptEnabled = typeof(options.javascriptEnabled) === "undefined" ? false : options.javascriptEnabled;
    options.imageTimeout = typeof(options.imageTimeout) === "undefined" ? 10000 : options.imageTimeout;
    options.renderer = typeof(options.renderer) === "function" ? options.renderer : CanvasRenderer;
    options.strict = !!options.strict;

    if (typeof(nodeList) === "string") {
        if (typeof(options.proxy) !== "string") {
            return Promise.reject("Proxy must be used when rendering url");
        }
        var width = options.width != null ? options.width : window.innerWidth;
        var height = options.height != null ? options.height : window.innerHeight;
        return loadUrlDocument(absoluteUrl(nodeList), options.proxy, document, width, height, options).then(function(container) {
            return renderWindow(container.contentWindow.document.documentElement, container, options, width, height);
        });
    }

    var node = ((nodeList === undefined) ? [document.documentElement] : ((nodeList.length) ? nodeList : [nodeList]))[0];
    node.setAttribute(html2canvasNodeAttribute + index, index);
    return renderDocument(node.ownerDocument, options, node.ownerDocument.defaultView.innerWidth, node.ownerDocument.defaultView.innerHeight, index).then(function(canvas) {
        if (typeof(options.onrendered) === "function") {
            log("options.onrendered is deprecated, html2canvas returns a Promise containing the canvas");
            options.onrendered(canvas);
        }
        return canvas;
    });
}

html2canvas.CanvasRenderer = CanvasRenderer;
html2canvas.NodeContainer = NodeContainer;
html2canvas.log = log;
html2canvas.utils = utils;

var html2canvasExport = (typeof(document) === "undefined" || typeof(Object.create) !== "function" || typeof(document.createElement("canvas").getContext) !== "function") ? function() {
    return Promise.reject("No canvas support");
} : html2canvas;

module.exports = html2canvasExport;

if (typeof(define) === 'function' && define.amd) {
    define('html2canvas', [], function() {
        return html2canvasExport;
    });
}

function renderDocument(document, options, windowWidth, windowHeight, html2canvasIndex) {
    return createWindowClone(document, document, windowWidth, windowHeight, options, document.defaultView.pageXOffset, document.defaultView.pageYOffset).then(function(container) {
        log("Document cloned");
        var attributeName = html2canvasNodeAttribute + html2canvasIndex;
        var selector = "[" + attributeName + "='" + html2canvasIndex + "']";
        document.querySelector(selector).removeAttribute(attributeName);
        var clonedWindow = container.contentWindow;
        var node = clonedWindow.document.querySelector(selector);
        var oncloneHandler = (typeof(options.onclone) === "function") ? Promise.resolve(options.onclone(clonedWindow.document)) : Promise.resolve(true);
        return oncloneHandler.then(function() {
            return renderWindow(node, container, options, windowWidth, windowHeight);
        });
    });
}

function renderWindow(node, container, options, windowWidth, windowHeight) {
    var clonedWindow = container.contentWindow;
    var support = new Support(clonedWindow.document);
    var imageLoader = new ImageLoader(options, support);
    var width = options.type === "view" ? windowWidth : documentWidth(clonedWindow.document);
    var height = options.type === "view" ? windowHeight : documentHeight(clonedWindow.document);
    var renderer = new options.renderer(width, height, imageLoader, options, document);
    var parser = new NodeParser(node, renderer, support, imageLoader, options);
    return parser.ready.then(function() {
        log("Finished rendering");
        var canvas;
        var bounds = getBounds(node);

        if (options.type === "view") {
            canvas = crop(renderer.canvas, {width: renderer.canvas.width, height: renderer.canvas.height, top: 0, left: 0, x: 0, y: 0});
        } else if (node === clonedWindow.document.body || node === clonedWindow.document.documentElement || options.canvas != null) {
            canvas = renderer.canvas;
        } else {
            canvas = crop(renderer.canvas, {width:  options.width != null ? options.width : bounds.width, height: options.height != null ? options.height : bounds.height, top: bounds.top, left: bounds.left, x: 0, y: 0});
        }

        cleanupContainer(container, options);
        return canvas;
    });
}

function cleanupContainer(container, options) {
    if (options.removeContainer) {
        container.parentNode.removeChild(container);
        log("Cleaned up container");
    }
}

function crop(canvas, bounds) {
    var croppedCanvas = document.createElement("canvas");
    var x1 = Math.min(canvas.width - 1, Math.max(0, bounds.left));
    var x2 = Math.min(canvas.width, Math.max(1, bounds.left + bounds.width));
    var y1 = Math.min(canvas.height - 1, Math.max(0, bounds.top));
    var y2 = Math.min(canvas.height, Math.max(1, bounds.top + bounds.height));
    croppedCanvas.width = bounds.width;
    croppedCanvas.height =  bounds.height;
    var width = x2-x1;
    var height = y2-y1;
    log("Cropping canvas at:", "left:", bounds.left, "top:", bounds.top, "width:", width, "height:", height);
    log("Resulting crop with width", bounds.width, "and height", bounds.height, "with x", x1, "and y", y1);
    croppedCanvas.getContext("2d").drawImage(canvas, x1, y1, width, height, bounds.x, bounds.y, width, height);
    return croppedCanvas;
}

function documentWidth (doc) {
    return Math.max(
        Math.max(doc.body.scrollWidth, doc.documentElement.scrollWidth),
        Math.max(doc.body.offsetWidth, doc.documentElement.offsetWidth),
        Math.max(doc.body.clientWidth, doc.documentElement.clientWidth)
    );
}

function documentHeight (doc) {
    return Math.max(
        Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight),
        Math.max(doc.body.offsetHeight, doc.documentElement.offsetHeight),
        Math.max(doc.body.clientHeight, doc.documentElement.clientHeight)
    );
}

function absoluteUrl(url) {
    var link = document.createElement("a");
    link.href = url;
    link.href = link.href;
    return link;
}

},{"./clone":10,"./imageloader":19,"./log":21,"./nodecontainer":22,"./nodeparser":23,"./proxy":24,"./renderers/canvas":28,"./support":32,"./utils":36}],13:[function(_dereq_,module,exports){
var log = _dereq_('./log');
var smallImage = _dereq_('./utils').smallImage;

function DummyImageContainer(src) {
    this.src = src;
    log("DummyImageContainer for", src);
    if (!this.promise || !this.image) {
        log("Initiating DummyImageContainer");
        DummyImageContainer.prototype.image = new Image();
        var image = this.image;
        DummyImageContainer.prototype.promise = new Promise(function(resolve, reject) {
            image.onload = resolve;
            image.onerror = reject;
            image.src = smallImage();
            if (image.complete === true) {
                resolve(image);
            }
        });
    }
}

module.exports = DummyImageContainer;

},{"./log":21,"./utils":36}],14:[function(_dereq_,module,exports){
var smallImage = _dereq_('./utils').smallImage;

function Font(family, size) {
    var container = document.createElement('div'),
        img = document.createElement('img'),
        span = document.createElement('span'),
        sampleText = 'Hidden Text',
        baseline,
        middle;

    container.style.visibility = "hidden";
    container.style.fontFamily = family;
    container.style.fontSize = size;
    container.style.margin = 0;
    container.style.padding = 0;

    document.body.appendChild(container);

    img.src = smallImage();
    img.width = 1;
    img.height = 1;

    img.style.margin = 0;
    img.style.padding = 0;
    img.style.verticalAlign = "baseline";

    span.style.fontFamily = family;
    span.style.fontSize = size;
    span.style.margin = 0;
    span.style.padding = 0;

    span.appendChild(document.createTextNode(sampleText));
    container.appendChild(span);
    container.appendChild(img);
    baseline = (img.offsetTop - span.offsetTop) + 1;

    container.removeChild(span);
    container.appendChild(document.createTextNode(sampleText));

    container.style.lineHeight = "normal";
    img.style.verticalAlign = "super";

    middle = (img.offsetTop-container.offsetTop) + 1;

    document.body.removeChild(container);

    this.baseline = baseline;
    this.lineWidth = 1;
    this.middle = middle;
}

module.exports = Font;

},{"./utils":36}],15:[function(_dereq_,module,exports){
var Font = _dereq_('./font');

function FontMetrics() {
    this.data = {};
}

FontMetrics.prototype.getMetrics = function(family, size) {
    if (this.data[family + "-" + size] === undefined) {
        this.data[family + "-" + size] = new Font(family, size);
    }
    return this.data[family + "-" + size];
};

module.exports = FontMetrics;

},{"./font":14}],16:[function(_dereq_,module,exports){
var utils = _dereq_('./utils');
var getBounds = utils.getBounds;
var loadUrlDocument = _dereq_('./proxy').loadUrlDocument;

function FrameContainer(container, sameOrigin, options) {
    this.image = null;
    this.src = container;
    var self = this;
    var bounds = getBounds(container);
    this.promise = (!sameOrigin ? this.proxyLoad(options.proxy, bounds, options) : new Promise(function(resolve) {
        if (container.contentWindow.document.URL === "about:blank" || container.contentWindow.document.documentElement == null) {
            container.contentWindow.onload = container.onload = function() {
                resolve(container);
            };
        } else {
            resolve(container);
        }
    })).then(function(container) {
        var html2canvas = _dereq_('./core');
        return html2canvas(container.contentWindow.document.documentElement, {type: 'view', width: container.width, height: container.height, proxy: options.proxy, javascriptEnabled: options.javascriptEnabled, removeContainer: options.removeContainer, allowTaint: options.allowTaint, imageTimeout: options.imageTimeout / 2});
    }).then(function(canvas) {
        return self.image = canvas;
    });
}

FrameContainer.prototype.proxyLoad = function(proxy, bounds, options) {
    var container = this.src;
    return loadUrlDocument(container.src, proxy, container.ownerDocument, bounds.width, bounds.height, options);
};

module.exports = FrameContainer;

},{"./core":12,"./proxy":24,"./utils":36}],17:[function(_dereq_,module,exports){
var Color = _dereq_('./color');

function GradientContainer(imageData) {
    this.src = imageData.value;
    this.colorStops = [];
    this.type = null;
    this.promise = Promise.resolve(true);
}

GradientContainer.prototype.parseColorStops = function(args, size) {
    this.colorStops = args.map(function(colorStop) {
        var colorStopMatch = colorStop.match(GradientContainer.REGEXP_COLORSTOP);
        if (!colorStopMatch) {
            return {
                color: "transparent",
                stop: null
            };
        }

        var value = +colorStopMatch[2];
        var unit = value === 0 ? "%" : colorStopMatch[3]; // treat "0" as "0%"
        var isTransparent = colorStopMatch[1] === "transparent";

        return {
            color: isTransparent ? colorStopMatch[1] : new Color(colorStopMatch[1]),
            // TODO: support absolute stop positions (e.g., compute gradient line length & convert px to ratio)
            stop: unit === "%" ? value / 100 : null
        };
    });

    // fix transparent stops based on neighboring colors for smooth and correct gradients
    // https://github.com/niklasvh/html2canvas/pull/777/
    for (var i = 0; i < this.colorStops.length; ++i) {
        var colorStop = this.colorStops[i];
 
        if (colorStop.color === "transparent") {
            var previousColor = null;
            var nextColor = null;
            var targetColor = null;
 
            if (i > 0) {
                previousColor = this.colorStops[i - 1].color;
            } 
            if (i + 1 < this.colorStops.length) {
                nextColor = this.colorStops[i + 1].color;
            } 
            if (previousColor) {
                // If we have a color before the transparency, that should the
                // color of this transparency as well
                targetColor = previousColor;
            } else {
                // Otherwise, the color following the transparency is our target color
                targetColor = nextColor;
            }
 
            // Copy target color setting alpha to 0
            colorStop.color = new Color([targetColor.r, targetColor.g, targetColor.b, 0]);
 
            // If this transparency is between 2 non-"transparent" colors then add a
            // new color stop at the same position but with the color of the following
            // color for a clean gradient
            if (previousColor && nextColor && nextColor !== "transparent") {
                var newColorStop = {
                    color: new Color([nextColor.r, nextColor.g, nextColor.b, 0]),
                    stop: colorStop.stop
                };
 
                this.colorStops.splice(i + 1, 0, newColorStop);
            }
        }
    }

    if (this.colorStops[0].stop === null) {
        this.colorStops[0].stop = 0;
    }

    if (this.colorStops[this.colorStops.length - 1].stop === null) {
        this.colorStops[this.colorStops.length - 1].stop = 1;
    }

    // calculates and fills-in explicit stop positions when omitted from rule
    this.colorStops.forEach(function(colorStop, index) {
        if (colorStop.stop === null) {
            this.colorStops.slice(index).some(function(find, count) {
                if (find.stop !== null) {
                    colorStop.stop = ((find.stop - this.colorStops[index - 1].stop) / (count + 1)) + this.colorStops[index - 1].stop;
                    return true;
                } else {
                    return false;
                }
            }, this);
        }
    }, this);
};

GradientContainer.TYPES = {
    LINEAR: 1,
    RADIAL: 2,
    REPEATING_LINEAR: 3,
    REPEATING_RADIAL: 4
};

// TODO: negative %/length values
// TODO: support <angle> (e.g. -?\d{1,3}(?:\.\d+)deg, etc. : https://developer.mozilla.org/docs/Web/CSS/angle )
//GradientContainer.REGEXP_COLORSTOP = /^\s*(rgba?\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3}(?:,\s*[0-9\.]+)?\s*\)|[a-z]{3,20}|#[a-f0-9]{3,6})(?:\s+(\d{1,3}(?:\.\d+)?)(%|px)?)?(?:\s|$)/i;

// with hsl[a] support
GradientContainer.REGEXP_COLORSTOP = /^\s*(rgba?\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3}(?:,\s*[0-9\.]+)?\s*\)|hsla?\(\s*\d{1,3},\s*[\d\.]+%,\s*[\d\.]+%(?:,\s*[0-9\.]+)?\s*\)|[a-z]{3,20}|#[a-f0-9]{3,6})(?:\s+(\d+(?:\.\d+)?)(%|px)?)?(?:\s|$)/i;

module.exports = GradientContainer;

},{"./color":11}],18:[function(_dereq_,module,exports){
function ImageContainer(src, cors) {
    this.src = src;
    this.image = new Image();
    var self = this;
    this.tainted = null;
    this.promise = new Promise(function(resolve, reject) {
        self.image.onload = resolve;
        self.image.onerror = reject;
        if (cors) {
            self.image.crossOrigin = "anonymous";
        }
        self.image.src = src;
        if (self.image.complete === true) {
            resolve(self.image);
        }
    });
}

module.exports = ImageContainer;

},{}],19:[function(_dereq_,module,exports){
var log = _dereq_('./log');
var ImageContainer = _dereq_('./imagecontainer');
var VideoContainer = _dereq_('./videocontainer');
var DummyImageContainer = _dereq_('./dummyimagecontainer');
var ProxyImageContainer = _dereq_('./areion_proxyimagecontainer');
var ProxyVideoContainer = _dereq_('./areion_proxyvideocontainer');
var FrameContainer = _dereq_('./framecontainer');
var SVGContainer = _dereq_('./svgcontainer');
var SVGNodeContainer = _dereq_('./svgnodecontainer');
var LinearGradientContainer = _dereq_('./lineargradientcontainer');
var RadialGradientContainer = _dereq_('./radialgradientcontainer');
var RepeatingLinearGradientContainer = _dereq_('./repeatinglineargradientcontainer');
var RepeatingRadialGradientContainer = _dereq_('./repeatingradialgradientcontainer');
var WebkitGradientContainer = _dereq_('./webkitgradientcontainer');
var bind = _dereq_('./utils').bind;

function ImageLoader(options, support) {
    this.link = null;
    this.options = options;
    this.support = support;
    this.origin = this.getOrigin(window.location.href);
}

ImageLoader.prototype.findImages = function(nodes) {
    var images = [];
    var videoIndex = 0;
    nodes.reduce(function(imageNodes, container) {
        switch(container.node.nodeName) {
        case "IMG":
            return imageNodes.concat([{
                args: [container.node.currentSrc || container.node.src],
                method: "url"
            }]);
        case "VIDEO":
            return imageNodes.concat([{
                args: [container.node],
                videoIndex: videoIndex++,
                method: "VIDEO"
            }]);
        case "svg":
        case "IFRAME":
            return imageNodes.concat([{
                args: [container.node],
                method: container.node.nodeName
            }]);
        }
        return imageNodes;
    }, []).forEach(this.addImage(images, this.loadImage), this);
    return images;
};

ImageLoader.prototype.findBackgroundImage = function(images, container) {
    container.parseBackgroundImages().filter(this.hasImageBackground).forEach(this.addImage(images, this.loadImage, container), this);

    var image = container.parseListStyleImage();
    if (image) {
        this.addImage(images, this.loadImage, container).call(this, image);
    }

    return images;
};

ImageLoader.prototype.addImage = function(images, callback, container) {
    return function(newImage) {
        newImage.args.forEach(function(image) {
            if (!this.imageExists(images, image)) {
                images.splice(0, 0, callback.call(this, newImage, container));
                log('Added image #' + (images.length), typeof(image) === "string" ? image.substring(0, 100) : image);
            }
        }, this);
    };
};

ImageLoader.prototype.hasImageBackground = function(imageData) {
    return imageData.method !== "none";
};

ImageLoader.prototype.loadImage = function(imageData, container) {
    if (this.options.cancel) {
        return;
    }

    if (imageData.method === "url") {
        var src = imageData.args[0];
        if (this.isSVG(src) && !this.support.svg && !this.options.allowTaint) {
            return new SVGContainer(src);
        } else if (src.match(/data:image\/.*;base64,/i)) {
            return new ImageContainer(src.replace(/url\(['"]{0,}|['"]{0,}\)$/ig, ''), false);
        } else if (this.isSameOrigin(src) || this.options.allowTaint === true || this.isSVG(src)) {
            return new ImageContainer(src, false);
        } else if (this.support.cors && !this.options.allowTaint && this.options.useCORS) {
            return new ImageContainer(src, true);
        } else if (this.options.proxy) {
            return new ProxyImageContainer(src, this.options.proxy);
        } else {
            return new DummyImageContainer(src);
        }
    } else if (imageData.method === "linear-gradient") {
        return new LinearGradientContainer(imageData);
    } else if (imageData.method === "radial-gradient") {
        return new RadialGradientContainer(imageData, container);
    } else if (imageData.method === "repeating-linear-gradient") {
        return new RepeatingLinearGradientContainer(imageData);
    } else if (imageData.method === "repeating-radial-gradient") {
        return new RepeatingRadialGradientContainer(imageData, container);
    } else if (imageData.method === "gradient") {
        return new WebkitGradientContainer(imageData);
    } else if (imageData.method === "svg") {
        return new SVGNodeContainer(imageData.args[0], this.support.svg);
    } else if (imageData.method === "IFRAME") {
        return new FrameContainer(imageData.args[0], this.isSameOrigin(imageData.args[0].src), this.options);
    } else if (imageData.method === "VIDEO") {
        var videoSrc = imageData.args[0].currentSrc || imageData.args[0].src;
        if (this.isSameOrigin(videoSrc) || this.options.allowTaint === true) {
            return new VideoContainer(imageData);
        } else {
            return new ProxyVideoContainer(imageData);
        }
    } else {
        return new DummyImageContainer(imageData);
    }
};

ImageLoader.prototype.isSVG = function(src) {
    return /\.svg(?:$|\?|#)/i.test(src) || SVGContainer.prototype.isInline(src);
};

ImageLoader.prototype.imageExists = function(images, src) {
    return images.some(function(image) {
        return image.src === src;
    });
};

ImageLoader.prototype.isSameOrigin = function(url) {
    return (this.getOrigin(url) === this.origin);
};

ImageLoader.prototype.getOrigin = function(url) {
    var link = this.link || (this.link = document.createElement("a"));
    link.href = url;
    link.href = link.href; // IE9, LOL! - http://jsfiddle.net/niklasvh/2e48b/
    return link.protocol + link.hostname + link.port;
};

ImageLoader.prototype.getPromise = function(container) {
    return this.timeout(container, this.options.imageTimeout)['catch'](function() {
        var dummy = new DummyImageContainer(container.src);
        return dummy.promise.then(function(image) {
            container.image = image;
        });
    });
};

ImageLoader.prototype.get = function(src) {
    var found = null;
    return this.images.some(function(img) {
        return (found = img).src === src;
    }) ? found : null;
};

ImageLoader.prototype.getVideo = function(videoIndex) {
    var found = null;
    return this.images.some(function(img) {
        return (found = img).videoIndex === videoIndex;
    }) ? found : null;
};

ImageLoader.prototype.fetch = function(nodes) {
    this.images = nodes.reduce(bind(this.findBackgroundImage, this), this.findImages(nodes));
    this.images.forEach(function(image, index) {
        image.promise.then(function() {
            log("Succesfully loaded image #"+ (index+1), image);
        }, function(e) {
            log("Failed loading image #"+ (index+1), image, e);
        });
    });
    this.ready = Promise.all(this.images.map(this.getPromise, this));
    log("Finished searching images");
    return this;
};

ImageLoader.prototype.timeout = function(container, timeout) {
    var timer;
    var promise = Promise.race([container.promise, new Promise(function(res, reject) {
        timer = setTimeout(function() {
            log("Timed out loading image", container);
            reject(container);
        }, timeout);
    })]).then(function(container) {
        clearTimeout(timer);
        return container;
    });
    promise['catch'](function() {
        clearTimeout(timer);
    });
    return promise;
};

module.exports = ImageLoader;

},{"./areion_proxyimagecontainer":8,"./areion_proxyvideocontainer":9,"./dummyimagecontainer":13,"./framecontainer":16,"./imagecontainer":18,"./lineargradientcontainer":20,"./log":21,"./radialgradientcontainer":26,"./repeatinglineargradientcontainer":29,"./repeatingradialgradientcontainer":30,"./svgcontainer":33,"./svgnodecontainer":34,"./utils":36,"./videocontainer":37,"./webkitgradientcontainer":38}],20:[function(_dereq_,module,exports){
var GradientContainer = _dereq_('./gradientcontainer');
var Color = _dereq_('./color');

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

},{"./color":11,"./gradientcontainer":17}],21:[function(_dereq_,module,exports){
var logger = function() {
    if (logger.options.logging && window.console && window.console.log) {
        Function.prototype.bind.call(window.console.log, (window.console)).apply(window.console, [(Date.now() - logger.options.start) + "ms", "html2canvas:"].concat([].slice.call(arguments, 0)));
    }
};

logger.options = {logging: false};
module.exports = logger;

},{}],22:[function(_dereq_,module,exports){
var Color = _dereq_('./color');
var utils = _dereq_('./utils');
var getBounds = utils.getBounds;
var parseBackgrounds = utils.parseBackgrounds;
var offsetBounds = utils.offsetBounds;

function NodeContainer(node, parent) {
    this.node = node;
    this.parent = parent;
    this.stack = null;
    this.bounds = null;
    this.borders = null;
    this.clip = [];
    this.backgroundClip = [];
    this.canvasBorder = [];
    this.offsetBounds = null;
    this.visible = null;
    this.computedStyles = null;
    this.colors = {};
    this.styles = {};
    this.backgroundImages = null;
    this.listStyleImage = undefined;
    this.transformData = null;
    this.transformMatrix = null;
    this.isPseudoElement = false;
    this.opacity = null;
}

NodeContainer.prototype.cloneTo = function(stack) {
    stack.visible = this.visible;
    stack.borders = this.borders;
    stack.bounds = this.bounds;
    stack.clip = this.clip;
    stack.backgroundClip = this.backgroundClip;
    stack.canvasBorder = this.canvasBorder;
    stack.computedStyles = this.computedStyles;
    stack.styles = this.styles;
    stack.backgroundImages = this.backgroundImages;
    stack.opacity = this.opacity;
};

NodeContainer.prototype.getOpacity = function() {
    if (this.opacity == null) {
        var opacity = parseFloat(this.css("opacity"));
        var container = this;
        while (isNaN(opacity)) {
            container = container.parent;
            if (!container) {
                opacity = 1;
                break;
            }
            opacity = parseFloat(container.css("opacity"));
        }

        this.opacity = opacity;
    }

    return this.opacity;
};

NodeContainer.prototype.assignStack = function(stack) {
    this.stack = stack;
    stack.children.push(this);
};

NodeContainer.prototype.isElementVisible = function() {
    return this.node.nodeType === Node.TEXT_NODE ? this.parent.visible : (
        this.css('display') !== "none" &&
        this.css('visibility') !== "hidden" &&
        (this.css('overflow') === "visible" || (this.cssInt('width') !== 0 && this.cssInt('height') !== 0)) &&
        !this.node.hasAttribute("data-html2canvas-ignore") &&
        (this.node.nodeName !== "INPUT" || this.node.getAttribute("type") !== "hidden")
    );
};

NodeContainer.prototype.css = function(attribute, forceGetFromComputedStyle) {
    // MCH -->
    // return the property value from the computed style in the element itself
    // used to fix the problem with transform-origin on pseudo elements
    if (forceGetFromComputedStyle) {
        var val = this.computedStyle(null)[attribute];
        if (val) {
            return val;
        }
    }
    // <--

    if (!this.computedStyles) {
        this.computedStyles = this.isPseudoElement ? this.parent.computedStyle(this.before ? ":before" : ":after") : this.computedStyle(null);
    }

    return this.styles[attribute] || (this.styles[attribute] = this.computedStyles[attribute]);
};

NodeContainer.prototype.prefixedCss = function(attribute, forceGetFromComputedStyle) {
    var prefixes = ["webkit", "moz", "ms", "o"];
    var value = this.css(attribute, forceGetFromComputedStyle);
    if (value === undefined) {
        prefixes.some(function(prefix) {
            value = this.css(prefix + attribute.substr(0, 1).toUpperCase() + attribute.substr(1), forceGetFromComputedStyle);
            return value !== undefined;
        }, this);
    }
    return value === undefined ? null : value;
};

NodeContainer.prototype.computedStyle = function(type) {
    return this.node.ownerDocument.defaultView.getComputedStyle(this.node, type);
};

NodeContainer.prototype.cssInt = function(attribute) {
    var value = parseInt(this.css(attribute), 10);
    return (isNaN(value)) ? 0 : value; // borders in old IE are throwing 'medium' for demo.html
};

NodeContainer.prototype.color = function(attribute) {
    return this.colors[attribute] || (this.colors[attribute] = new Color(this.css(attribute)));
};

NodeContainer.prototype.cssFloat = function(attribute) {
    var value = parseFloat(this.css(attribute));
    return (isNaN(value)) ? 0 : value;
};

NodeContainer.prototype.fontWeight = function() {
    var weight = this.css("fontWeight");
    switch(parseInt(weight, 10)){
    case 401:
        weight = "bold";
        break;
    case 400:
        weight = "normal";
        break;
    }
    return weight;
};

NodeContainer.prototype.parseClip = function() {
    var matches = this.css('clip').match(this.CLIP);
    if (matches) {
        return {
            top: parseInt(matches[1], 10),
            right: parseInt(matches[2], 10),
            bottom: parseInt(matches[3], 10),
            left: parseInt(matches[4], 10)
        };
    }
    return null;
};

NodeContainer.prototype.parseBackgroundImages = function() {
    return this.backgroundImages || (this.backgroundImages = parseBackgrounds(this.css("backgroundImage")));
};

NodeContainer.prototype.parseListStyleImage = function() {
    if (this.listStyleImage === undefined) {
        var images = parseBackgrounds(this.css("listStyleImage"));
        if (images && images.length > 0) {
            this.listStyleImage = images[0];
        } else {
            this.listStyleImage = null;
        }
    }

    return this.listStyleImage;
};

NodeContainer.prototype.parseBackgroundSize = function(bounds, image, index) {
    var size = (this.css("backgroundSize") || '').split(',');
    size = size[index || 0] || size[0] || 'auto';
    size = size.trim().split(' ');
    if (size.length === 1) {
        size.push('auto');
    }

    var width, height;

    if (isPercentage(size[0])) {
        width = bounds.width * parseFloat(size[0]) / 100;
    } else if (/contain|cover/.test(size[0])) {
        var targetRatio = bounds.width / bounds.height, currentRatio = image.width / image.height;
        return (targetRatio < currentRatio ^ size[0] === 'contain') ?  {width: bounds.height * currentRatio, height: bounds.height} : {width: bounds.width, height: bounds.width / currentRatio};
    } else {
        width = parseInt(size[0], 10);
    }

    if (size[0] === 'auto' && size[1] === 'auto') {
        height = image.height;
    } else if (size[1] === 'auto') {
        height = width / image.width * image.height;
    } else if (isPercentage(size[1])) {
        height =  bounds.height * parseFloat(size[1]) / 100;
    } else {
        height = parseInt(size[1], 10);
    }

    if (size[0] === 'auto') {
        width = height / image.height * image.width;
    }

    return {width: width, height: height};
};

NodeContainer.prototype.parseBackgroundPosition = function(bounds, image, index, backgroundSize) {
    var positionX = this.css('backgroundPositionX');
    var bgPosition = this.css('backgroundPosition');
    var positionY;
    if (positionX === undefined) {
        // the properties "backgroundPositionX" and "backgroundPositionY" don't exist; parse "backgroundPosition"
        var position = bgPosition.split(/\s+/);
        if (position.length === 1) {
            // 1 value syntax:
            // - keyword "top", "left", "bottom", "right" => other dimension is set to "50%"
            // - length or percentage: specifies x-coordinate relative to left edge; y set to "50%"
            // (https://developer.mozilla.org/en-US/docs/Web/CSS/background-position)

            positionX = position[0];
            if (positionX === "top" || positionX === "bottom") {
                positionY = positionX;
                positionX = "50%";
            } else {
                positionY = "50%";
            }
        } else {
            // 2 value syntax
            positionX = position[0];
            positionY = position[1];
        }
    } else {
        // the properties "backgroundPositionX" and "backgroundPositionY" exist
        positionY = this.css('backgroundPositionY');
    }

    var left, top;
    if (positionX === 'left') {
        left = 0;
    } else if (positionX === 'center') {
        left = (bounds.width - (backgroundSize || image).width) * 0.5;
    } else if (positionX === 'right') {
        left = bounds.width - (backgroundSize || image).width;
    } else if (isPercentage(positionX)){
        left = (bounds.width - (backgroundSize || image).width) * (parseFloat(positionX) / 100);
    } else if (bgPosition.indexOf('right') === 0) {
        left = bounds.width - (backgroundSize || image).width - parseInt(positionX, 10);
    } else {
        left = parseInt(positionX, 10);
    }

    if (positionY === 'auto') {
        top = left / image.width * image.height;
    } else if (positionY === 'top') {
        top = 0;
    } else if (positionY === 'center') {
        top =  (bounds.height - (backgroundSize || image).height) * 0.5;
    } else if (positionY === 'bottom') {
        top =  bounds.height - (backgroundSize || image).height;
    } else if (isPercentage(positionY)){
        top =  (bounds.height - (backgroundSize || image).height) * parseFloat(positionY) / 100;
    } else if (bgPosition.indexOf('bottom') !== -1) {
        top = bounds.height - (backgroundSize || image).height - parseInt(positionY, 10);
    } else {
        top = parseInt(positionY, 10);
    }

    if (positionX === 'auto') {
        left = top / image.height * image.width;
    }

    return {left: left, top: top};
};

NodeContainer.prototype.parseBackgroundOrigin = function(bounds, index, includeBorder) {
    var borderLeft = this.cssInt('borderLeftWidth');
    var borderRight = this.cssInt('borderRightWidth');
    var borderTop = this.cssInt('borderTopWidth');
    var borderBottom = this.cssInt('borderBottomWidth');

    var borderOffsetLeft = includeBorder ? borderLeft : 0;
    var borderOffsetTop = includeBorder ? borderTop : 0;

    switch (this.css("backgroundOrigin")) {
    case "content-box":
        var paddingLeft = this.cssInt('paddingLeft');
        var paddingRight = this.cssInt('paddingRight');
        var paddingTop = this.cssInt('paddingTop');
        var paddingBottom = this.cssInt('paddingBottom');

        return {
            left: bounds.left + paddingLeft + borderOffsetLeft,
            top: bounds.top + paddingTop + borderOffsetTop,
            right: bounds.right - paddingRight,
            bottom: bounds.bottom - paddingBottom,
            width: bounds.width - paddingLeft - paddingRight - borderLeft - borderRight,
            height: bounds.height - paddingTop - paddingBottom - borderTop - borderBottom
        };

    case "padding-box":
        return {
            left: bounds.left + borderOffsetLeft,
            top: bounds.top + borderOffsetTop,
            right: bounds.right,
            bottom: bounds.bottom,
            width: bounds.width - borderLeft - borderRight,
            height: bounds.height - borderTop - borderBottom
        };

    case "border-box":
        return {
            left: bounds.left - borderLeft + borderOffsetLeft,
            top: bounds.top - borderTop + borderOffsetTop,
            right: bounds.right + borderRight,
            bottom: bounds.bounds + borderBottom,
            width: bounds.width,
            height: bounds.height
        };
    }
};

NodeContainer.prototype.parseBackgroundRepeat = function(index) {
    return this.css("backgroundRepeat");
};

NodeContainer.prototype.parseTextShadows = function() {
    var textShadow = this.css("textShadow");
    var results = [];

    if (textShadow && textShadow !== 'none') {
        var shadows = textShadow.match(this.TEXT_SHADOW_PROPERTY);
        for (var i = 0; shadows && (i < shadows.length); i++) {
            var s = shadows[i].match(this.TEXT_SHADOW_VALUES);
            results.push({
                color: new Color(s[0]),
                offsetX: s[1] ? parseFloat(s[1].replace('px', '')) : 0,
                offsetY: s[2] ? parseFloat(s[2].replace('px', '')) : 0,
                blur: s[3] ? parseFloat(s[3].replace('px', '')) : 0
            });
        }
    }
    return results;
};

NodeContainer.prototype.parseTransform = function() {
    if (!this.transformData) {
        if (this.hasTransform()) {
            var offset = this.parseBounds();
            var origin = this.prefixedCss("transformOrigin", true).split(" ").map(removePx).map(asFloat);
            origin[0] += offset.left;
            origin[1] += offset.top;

            this.transformData = {
                origin: origin,
                matrix: this.parseTransformMatrix()
            };
        } else {
            this.transformData = {
                origin: [0, 0],
                matrix: [1, 0, 0, 1, 0, 0]
            };
        }
    }
    return this.transformData;
};

NodeContainer.prototype.parseTransformMatrix = function() {
    if (!this.transformMatrix) {
        var transform = this.prefixedCss("transform");
        var matrix = transform ? parseMatrix(transform.match(this.MATRIX_PROPERTY)) : null;
        this.transformMatrix = matrix ? matrix : [1, 0, 0, 1, 0, 0];
    }
    return this.transformMatrix;
};

NodeContainer.prototype.inverseTransform = function() {
    var transformData = this.parseTransform();
    var inverseOrigin = [];
    for (var i = 0; i < transformData.origin.length; i++) {
        inverseOrigin.push(-transformData.origin[i]);
    }
    return { origin: inverseOrigin, matrix: utils.matrixInverse(transformData.matrix) };
};

NodeContainer.prototype.parseBounds = function() {
    return this.bounds || (this.bounds = this.hasTransform() ? offsetBounds(this.node) : getBounds(this.node));
};

NodeContainer.prototype.hasTransform = function() {
    return this.parseTransformMatrix().join(",") !== "1,0,0,1,0,0" || (this.parent && this.parent.hasTransform());
};

NodeContainer.prototype.getValue = function() {
    var value = this.node.value || "";
    if (this.node.tagName === "SELECT") {
        value = selectionValue(this.node);
    } else if (this.node.type === "password") {
        value = Array(value.length + 1).join('\u2022'); // jshint ignore:line
    }
    return value.length === 0 ? (this.node.placeholder || "") : value;
};

NodeContainer.prototype.isPlaceholderShown = function() {
    return this.node.tagName !== "SELECT" && !this.node.value && !!this.node.placeholder;
};

NodeContainer.prototype.MATRIX_PROPERTY = /(matrix|matrix3d)\((.+)\)/;
NodeContainer.prototype.TEXT_SHADOW_PROPERTY = /((rgba|rgb)\([^\)]+\)(\s-?\d+px){0,})/g;
NodeContainer.prototype.TEXT_SHADOW_VALUES = /(-?\d+px)|(#.+)|(rgb\(.+\))|(rgba\(.+\))/g;
NodeContainer.prototype.CLIP = /^rect\((\d+)px,? (\d+)px,? (\d+)px,? (\d+)px\)$/;

function selectionValue(node) {
    var option = node.options[node.selectedIndex || 0];
    return option ? (option.text || "") : "";
}

function parseMatrix(match) {
    if (match && match[1] === "matrix") {
        return match[2].split(",").map(function(s) {
            return parseFloat(s.trim());
        });
    } else if (match && match[1] === "matrix3d") {
        var matrix3d = match[2].split(",").map(function(s) {
          return parseFloat(s.trim());
        });
        return [matrix3d[0], matrix3d[1], matrix3d[4], matrix3d[5], matrix3d[12], matrix3d[13]];
    }
}

function isPercentage(value) {
    return value.toString().indexOf("%") !== -1;
}

function removePx(str) {
    return str.replace("px", "");
}

function asFloat(str) {
    return parseFloat(str);
}

module.exports = NodeContainer;

},{"./color":11,"./utils":36}],23:[function(_dereq_,module,exports){
var log = _dereq_('./log');
var punycode = _dereq_('punycode');
var NodeContainer = _dereq_('./nodecontainer');
var TextContainer = _dereq_('./textcontainer');
var PseudoElementContainer = _dereq_('./pseudoelementcontainer');
var FontMetrics = _dereq_('./fontmetrics');
var Color = _dereq_('./color');
var StackingContext = _dereq_('./stackingcontext');
var utils = _dereq_('./utils');
var ListStyleTypeFormatter = _dereq_('liststyletype-formatter');

var bind = utils.bind;
var getBounds = utils.getBounds;
var parseBackgrounds = utils.parseBackgrounds;
var offsetBounds = utils.offsetBounds;
var getMatchingRules = utils.getMatchingRules;

function NodeParser(element, renderer, support, imageLoader, options) {
    log("Starting NodeParser");
    this.renderer = renderer;
    this.options = options;
    this.range = null;
    this.support = support;
    this.renderQueue = [];
    this.stack = new StackingContext(true, 1, element.ownerDocument, null);
    var parent = new NodeContainer(element, null);
    if (options.background) {
        renderer.rectangle(0, 0, renderer.width, renderer.height, new Color(options.background));
    }
    if (element === element.ownerDocument.documentElement) {
        // http://www.w3.org/TR/css3-background/#special-backgrounds
        var canvasBackground = new NodeContainer(parent.color('backgroundColor').isTransparent() ? element.ownerDocument.body : element.ownerDocument.documentElement, null);
        renderer.rectangle(0, 0, renderer.width, renderer.height, canvasBackground.color('backgroundColor'));
    }
    parent.visibile = parent.isElementVisible();
    this.createPseudoHideStyles(element.ownerDocument);
    this.disableAnimations(element.ownerDocument);

    this.counters = {};
    this.quoteDepth = 0;
    this.resolvePseudoContent(element);

    // MCH -->
    var width = window.innerWidth || document.documentElement.clientWidth;
    var height = window.innerHeight || document.documentElement.clientHeight;

    var allNodes = [parent].concat(this.getChildren(parent));
    allNodes.forEach(function(container) {
        // test for visibility in viewport
        var isVisible = container.isElementVisible();
        if (isVisible && options.type === 'view') {
            var rect = container.node.getBoundingClientRect && container.node.getBoundingClientRect();
            if (rect) {
                isVisible = rect.left <= width && rect.right >= 0 && rect.top <= height && rect.bottom >= 0;
            }

            // make sure all the parent nodes are also visible
            if (isVisible) {
                var parent = container.parent;
                while (parent && !parent.visible) {
                    parent.visible = true;
                    parent = parent.parent;
                }
            }
        }
        container.visible = isVisible;
    });

    this.nodes = flatten(allNodes
        .filter(function(container) { return container.visible; })
        .map(this.getPseudoElements, this)
        .map(this.applyInlineStylesToSvg, this)
    );

    // <--

    /*
    this.nodes = flatten([parent].concat(this.getChildren(parent)).filter(function(container) {
        return container.visible = container.isElementVisible();
    }).map(this.getPseudoElements, this));
    */

    this.fontMetrics = new FontMetrics();
    log("Fetched nodes, total:", this.nodes.length);
    log("Calculate overflow clips");
    this.calculateOverflowClips();
    log("Start fetching images");
    this.images = imageLoader.fetch(this.nodes.filter(isElement));
    this.ready = this.images.ready.then(bind(function() {
        log("Images loaded, starting parsing");
        log("Creating stacking contexts");
        this.createStackingContexts();
        log("Sorting stacking contexts");
        this.sortStackingContexts(this.stack);
        this.parse(this.stack);
        log("Render queue created with " + this.renderQueue.length + " items");
        return new Promise(bind(function(resolve) {
            if (!options.async) {
                this.renderQueue.forEach(this.paint, this);
                resolve();
            } else if (typeof(options.async) === "function") {
                options.async.call(this, this.renderQueue, resolve);
            } else if (this.renderQueue.length > 0){
                this.renderIndex = 0;
                this.asyncRenderer(this.renderQueue, resolve);
            } else {
                resolve();
            }
        }, this));
    }, this));
}

NodeParser.prototype.calculateOverflowClips = function() {
    this.nodes.forEach(function(container) {
        if (isElement(container)) {
            if (isPseudoElement(container)) {
                container.appendToDOM();
            }
            container.borders = this.parseBorders(container);
            var clip = (container.css('overflow') === "hidden" ||
                        container.css('overflow') === "scroll") ? [container.borders.clip] : [];
            var cssClip = container.parseClip();
            if (cssClip && ["absolute", "fixed"].indexOf(container.css('position')) !== -1) {
                clip.push([["rect",
                        container.bounds.left + cssClip.left,
                        container.bounds.top + cssClip.top,
                        cssClip.right - cssClip.left,
                        cssClip.bottom - cssClip.top
                ]]);
            }

            // MCH -->
            // if the container has a transform, calculate the pre-image of the top left and bottom right
            // corners of the canvas and apply the inverse transform to the clips of the parent containers
            var hasTransform = container.hasTransform();
            var a11, a12, a13, a21, a22, a23, ox, oy;
            if (hasTransform) {
                var invTransform = container.inverseTransform();
                var m = invTransform.matrix;
                a11 = m[0];
                a12 = m[2];
                a13 = m[4];
                a21 = m[1];
                a22 = m[3];
                a23 = m[5];
                ox = invTransform.origin[0];
                oy = invTransform.origin[1];

                var b = (container && container.parent && container.parent.canvasBorder) || [0, 0, this.renderer.width, this.renderer.height];
                container.canvasBorder = [
                    a11 * (b[0] + ox) + a12 * (b[1] + oy) + a13 - ox,
                    a21 * (b[0] + ox) + a22 * (b[1] + oy) + a23 - oy,
                    a11 * (b[2] + ox) + a12 * (b[3] + oy) + a13 - ox,
                    a21 * (b[2] + ox) + a22 * (b[3] + oy) + a23 - oy
                ];
            } else {
                container.canvasBorder = [0, 0, this.renderer.width, this.renderer.height];
            }

            var parentClip = getParentClip(container);
            if (parentClip) {
                if (hasTransform) {
                    var len = parentClip.length;
                    container.clip = [];

                    for (var i = 0; i < len; i++) {
                        var c = parentClip[i];
                        var lenClip = c.length;
                        var transformedClip = [];

                        for (var j = 0; j < lenClip; j++) {
                            var shape = c[j];

                            //                    [ a11 a12 | a13 ]   [ x + ox ]    [ ox ]
                            // v' = A*(v+o) - o = [ a21 a22 | a23 ] * [ y + oy ] -  [ oy ]
                            //                    [   0   0 |   1 ]   [   1    ]    [  0 ]
                            // x' = a11*(x+ox) + a12*(y+oy) + a13 - ox
                            // y' = a21*(x+ox) + a22*(y+oy) + a23 - oy

                            var transformedShape = [shape[0]];
                            var lenShape = shape.length;
                            for (var k = 1; k < lenShape; k += 2) {
                                transformedShape.push(
                                    a11 * (shape[k] + ox) + a12 * (shape[k + 1] + oy) + a13 - ox,
                                    a21 * (shape[k] + ox) + a22 * (shape[k + 1] + oy) + a23 - oy
                                );
                            }
                            transformedClip.push(transformedShape);
                        }
                        container.clip.push(transformedClip);
                    }
                    Array.prototype.push.apply(container.clip, clip);
                } else {
                    container.clip = parentClip.concat(clip);
                }
            } else {
                container.clip = clip;
            }

            // original code:
            // container.clip = hasParentClip(container) ? container.parent.clip.concat(clip) : clip;
            // <--

            container.backgroundClip = (container.css('overflow') !== "hidden") ? container.clip.concat([container.borders.clip]) : container.clip;
            if (isPseudoElement(container)) {
                container.cleanDOM();
            }
        } else if (isTextNode(container)) {
            container.clip = hasParentClip(container) ? container.parent.clip : [];
        }
        if (!isPseudoElement(container)) {
            container.bounds = null;
        }
    }, this);
};

function hasParentClip(container) {
    return container.parent && container.parent.clip.length;
}

function getParentClip(container) {
    var pos = container.css('position');

    if (pos === 'fixed') {
        return null;
    }
    if (pos !== 'absolute') {
        return container.parent && container.parent.clip;
    }

    for (var parent = container.parent; parent; parent = parent.parent) {
        if (parent.css('position') !== 'static') {
            return parent.clip;
        }
    }
    return null;
}

NodeParser.prototype.asyncRenderer = function(queue, resolve, asyncTimer) {
    asyncTimer = asyncTimer || Date.now();
    this.paint(queue[this.renderIndex++]);
    if (queue.length === this.renderIndex) {
        resolve();
    } else if (asyncTimer + 20 > Date.now()) {
        this.asyncRenderer(queue, resolve, asyncTimer);
    } else {
        setTimeout(bind(function() {
            this.asyncRenderer(queue, resolve);
        }, this), 0);
    }
};

NodeParser.prototype.createPseudoHideStyles = function(document) {
    this.createStyles(document, '.' + PseudoElementContainer.prototype.PSEUDO_HIDE_ELEMENT_CLASS_BEFORE + ':before { content: "" !important; display: none !important; }' +
        '.' + PseudoElementContainer.prototype.PSEUDO_HIDE_ELEMENT_CLASS_AFTER + ':after { content: "" !important; display: none !important; }');
};

NodeParser.prototype.disableAnimations = function(document) {
    this.createStyles(document, '* { -webkit-animation: none !important; -moz-animation: none !important; -o-animation: none !important; animation: none !important; ' +
        '-webkit-transition: none !important; -moz-transition: none !important; -o-transition: none !important; transition: none !important;}');
};

NodeParser.prototype.createStyles = function(document, styles) {
    var hidePseudoElements = document.createElement('style');
    hidePseudoElements.innerHTML = styles;
    document.body.appendChild(hidePseudoElements);
};

NodeParser.prototype.getPseudoElements = function(container) {
    var nodes = [[container]];
    if (container.node.nodeType === Node.ELEMENT_NODE) {
        var before = this.getPseudoElement(container, ":before");
        var after = this.getPseudoElement(container, ":after");

        if (before) {
            nodes.push(before);
        }

        if (after) {
            nodes.push(after);
        }
    }
    return flatten(nodes);
};

/**
 * applyInlineStylesToSvgs' workhorse.
 */
function applyInlineStylesRecursive(node) {
    if (node.nodeName !== "use" && node.nodeName !== "symbol") {
        var cStyle = getComputedStyle(node);
        for (var j = cStyle.length - 1; j >= 0; j--) {
            var property = toCamelCase(cStyle.item(j));
            node.style[property] = cStyle[property];
        }
    }

    var childNodes = node.childNodes;
    var len = childNodes.length;

    for (var i = 0; i < len; i++) {
        var childNode = childNodes[i];
        if (childNode.nodeType === 1) {
            applyInlineStylesRecursive(childNode);
        }
    }
}

/**
 * Make sure we apply all styles as inline styles of SVG and any
 * contained elements so that fabric renders the properly.
 */
NodeParser.prototype.applyInlineStylesToSvg = function(container) {
    var n = container[0].node;
    if (n.nodeType === 1 && n.tagName === "svg") {
        applyInlineStylesRecursive(n);
    }
    return container;
};


function toCamelCase(str) {
    return str.replace(/(\-[a-z])/g, function(match){
        return match.toUpperCase().replace('-','');
    });
}

NodeParser.prototype.resolvePseudoContent = function(element) {
    var style = getComputedStyle(element);
    var counterReset = style.counterReset;
    var counters = [];
    var i;

    if (counterReset && counterReset !== "none") {
        var counterResets = counterReset.split(/\s*,\s*/);
        var lenCounterResets = counterResets.length;

        for (i = 0; i < lenCounterResets; i++) {
            var parts = counterResets[i].split(/\s+/);
            counters.push(parts[0]);
            var counter = this.counters[parts[0]];
            if (!counter) {
                counter = this.counters[parts[0]] = [];
            }
            counter.push(parseInt(parts[1] || 0, 10));
        }
    }

    // handle the ::before pseudo element
    element._contentBefore = this.resolvePseudoContentInternal(element, getComputedStyle(element, ":before"));

    // handle children
    var children = element.childNodes;
    var len = children.length;
    for (i = 0; i < len; i++) {
        var child = children[i];
        if (child.nodeType === 1) {
            this.resolvePseudoContent(children[i]);
        }
    }

    // handle the ::after pseudo element
    element._contentAfter = this.resolvePseudoContentInternal(element, getComputedStyle(element, ":after"));

    var lenCounters = counters.length;
    for (i = 0; i < lenCounters; i++) {
        this.counters[counters[i]].pop();
    }
};

NodeParser.prototype.getQuote = function(style, isOpening) {
    var quotes = style.quotes ? style.quotes.split(/\s+/) : [ "'\"'", "'\"'" ];
    var idx = this.quoteDepth * 2;
    if (idx >= quotes.length) {
        idx = quotes.length - 2;
    }
    if (!isOpening) {
        ++idx;
    }
    return quotes[idx].replace(/^["']|["']$/g, "");
};

NodeParser.prototype.resolvePseudoContentInternal = function(element, style) {
    if (!style || !style.content || style.content === "none" || style.content === "-moz-alt-content" || style.display === "none") {
        return null;
    }

    var tokens = NodeParser.parsePseudoContent(style.content);
    var len = tokens.length;
    var ret = [];
    var s = "";

    // increment the counter (if there is a "counter-increment" declaration)
    var counterIncrement = style.counterIncrement;
    if (counterIncrement && counterIncrement !== "none") {
        var parts = counterIncrement.split(/\s+/);
        var ctr = this.counters[parts[0]];
        if (ctr) {
            ctr[ctr.length - 1] += parts[1] === undefined ? 1 : parseInt(parts[1], 10);
        }
    }

    // build the content string
    for (var i = 0; i < len; i++) {
        var token = tokens[i];
        switch (token.type) {
        case "string":
            s += token.value;
            break;

        case "attr":
            break;

        case "counter":
            var counter = this.counters[token.name];
            if (counter) {
                s += this.formatCounterValue([counter[counter.length - 1]], '', token.format);
            }
            break;

        case "counters":
            var counters = this.counters[token.name];
            if (counters) {
                s += this.formatCounterValue(counters, token.glue, token.format);
            }
            break;

        case "open-quote":
            s += this.getQuote(style, true);
            ++this.quoteDepth;
            break;

        case "close-quote":
            --this.quoteDepth;
            s += this.getQuote(style, false);
            break;

        case "url":
            if (s) {
                ret.push({ type: "string", value: s });
                s = "";
            }
            ret.push({ type: "image", url: token.href });
            break;
        }
    }

    if (s) {
        ret.push({ type: "string", value: s });
    }

    return ret;
};

NodeParser.prototype.formatCounterValue = function(counter, glue, format) {
    var ret = '';
    var len = counter.length;

    for (var i = 0; i < len; i++) {
        if (i > 0) {
            ret += glue;
        }
        ret += ListStyleTypeFormatter.format(counter[i], format, false);
    }

    return ret;
};

var _parsedContent = {};

NodeParser.parsePseudoContent = function(content) {
    if (_parsedContent[content]) {
        return _parsedContent[content];
    }

    var tokens = [];
    var len = content.length;
    var isString = false;
    var isEscaped = false;
    var isFunction = false;
    var str = "";
    var functionName = "";
    var args = [];

    for (var i = 0; i < len; i++) {
        var c = content.charAt(i);

        switch (c) {
        case "'":
        case "\"":
            if (isEscaped) {
                str += c;
            } else {
                isString = !isString;
                if (!isFunction && !isString) {
                    tokens.push({ type: "string", value: str });
                    str = "";
                }
            }
            break;

        case "\\":
            if (isEscaped) {
                str += c;
                isEscaped = false;
            } else {
                isEscaped = true;
            }
            break;

        case "(":
            if (isString) {
                str += c;
            } else {
                isFunction = true;
                functionName = str;
                str = "";
                args = [];
            }
            break;

        case ")":
            if (isString) {
                str += c;
            } else if (isFunction) {
                if (str) {
                    args.push(str);
                }

                switch (functionName) {
                case "attr":
                    if (args.length > 0) {
                        tokens.push({ type: "attr", attr: args[0] });
                    }
                    break;

                case "counter":
                    if (args.length > 0) {
                        var counter = {
                            type: "counter",
                            name: args[0]
                        };
                        if (args.length > 1) {
                            counter.format = args[1];
                        }
                        tokens.push(counter);
                    }
                    break;

                case "counters":
                    if (args.length > 0) {
                        var counters = {
                            type: "counters",
                            name: args[0]
                        };
                        if (args.length > 1) {
                            counters.glue = args[1];
                        }
                        if (args.length > 2) {
                            counters.format = args[2];
                        }
                        tokens.push(counters);
                    }
                    break;

                case "url":
                    if (args.length > 0) {
                        tokens.push({ type: "url", href: args[0] });
                    }
                    break;
                }

                isFunction = false;
                str = "";
            }
            break;

        case ",":
            if (isString) {
                str += c;
            } else if (isFunction) {
                args.push(str);
                str = "";
            }
            break;

        case " ":
        case "\t":
            if (isString) {
                str += c;
            } else if (str) {
                tokens.push({ type: str });
                str = "";
            }
            break;

        default:
            str += c;
        }

        if (c !== "\\") {
            isEscaped = false;
        }
    }

    if (str) {
        tokens.push({ type: str });
    }

    _parsedContent[content] = tokens;
    return tokens;
};

NodeParser.prototype.getPseudoElement = function(container, type) {
    var style = container.computedStyle(type);
    if(!style || !style.content || style.content === "none" || style.content === "-moz-alt-content" || style.display === "none" || style.visibility === "hidden") {
        return null;
    }

    var content = type === ":before" ? container.node._contentBefore : container.node._contentAfter;
    var len = content.length;

    var pseudoNode = document.createElement("html2canvaspseudoelement");
    var pseudoContainer = new PseudoElementContainer(pseudoNode, container, type);

    for (var j = style.length - 1; j >= 0; j--) {
        var property = toCamelCase(style.item(j));
        if (property !== "content") {
            pseudoNode.style[property] = style[property];
        }
    }

    pseudoNode.className = PseudoElementContainer.prototype.PSEUDO_HIDE_ELEMENT_CLASS_BEFORE + " " + PseudoElementContainer.prototype.PSEUDO_HIDE_ELEMENT_CLASS_AFTER;

    var ret = [pseudoContainer];

    for (var i = 0; i < len; i++) {
        var item = content[i];

        if (item.type === "image") {
            var img = document.createElement("img");
            img.src = parseBackgrounds("url(" + item.url + ")")[0].args[0];
            img.style.opacity = "1";
            pseudoNode.appendChild(img);
            ret.push(new NodeContainer(img, pseudoContainer));
        } else {
            var text = document.createTextNode(item.value);
            pseudoNode.appendChild(text);
            ret.push(new TextContainer(text, pseudoContainer));
        }
    }

    return ret;
};


NodeParser.prototype.getChildren = function(parentContainer) {
    return flatten(Array.prototype.filter.call(parentContainer.node.childNodes, renderableNode).map(function(node) {
        var container = [node.nodeType === Node.TEXT_NODE ? new TextContainer(node, parentContainer) : new NodeContainer(node, parentContainer)].filter(nonIgnoredElement);
        return node.nodeType === Node.ELEMENT_NODE && container.length && node.tagName !== "TEXTAREA" ? (container[0].isElementVisible() ? container.concat(this.getChildren(container[0])) : []) : container;
    }, this));
};

NodeParser.prototype.newStackingContext = function(container, hasOwnStacking) {
    var stack = new StackingContext(hasOwnStacking, container.getOpacity(), container.node, container.parent);
    var opacity = stack.opacity;
    container.cloneTo(stack);

    // MCH -->
    // "cloneTo" overwrites the opacity
    stack.opacity = opacity;
    // <--

    var parentStack = hasOwnStacking ? stack.getParentStack(this) : stack.parent.stack;
    parentStack.contexts.push(stack);
    container.stack = stack;
};

NodeParser.prototype.createStackingContexts = function() {
    this.nodes.forEach(function(container) {
        if (isElement(container) && (this.isRootElement(container) || hasOpacity(container) || isPositionedForStacking(container, container.parent && container.parent.hasChildWithOwnStacking) || this.isBodyWithTransparentRoot(container) || container.hasTransform())) {
            this.newStackingContext(container, true);

            // MCH -->
            if (container.parent) {
                // set a flag on the parent that one of its children has its own stacking context
                // we use this so that an absolutely (or relatively) positioned node without z-index
                // following one with a stacking context (e.g., due to a transform on the node)
                // is positioned correctly (above the previous sibling)
                container.parent.hasChildWithOwnStacking = true;
            }
            // <--
        } else if (isElement(container) && ((isPositioned(container) && zIndex0(container)) || isInlineBlock(container) || isFloating(container))) {
            this.newStackingContext(container, false);
        } else {
            container.assignStack(container.parent.stack);
        }
    }, this);
};

NodeParser.prototype.isBodyWithTransparentRoot = function(container) {
    return container.node.nodeName === "BODY" && container.parent.color('backgroundColor').isTransparent();
};

NodeParser.prototype.isRootElement = function(container) {
    return container.parent === null;
};

NodeParser.prototype.sortStackingContexts = function(stack) {
    stack.contexts.sort(zIndexSort(stack.contexts.slice(0)));
    stack.contexts.forEach(this.sortStackingContexts, this);
};

NodeParser.prototype.parseTextBounds = function(container) {
    return function(text, index, textList) {
        if (container.parent.css("textDecoration").substr(0, 4) !== "none" || text.trim().length !== 0) {
            if (this.support.rangeBounds && !container.parent.hasTransform()) {
                var offset = textList.slice(0, index).join("").length;
                return this.getRangeBounds(container.node, offset, text.length);
            } else if (container.node && typeof(container.node.data) === "string") {
                var replacementNode = container.node.splitText(text.length);
                var bounds = this.getWrapperBounds(container.node, container.parent.hasTransform());
                container.node = replacementNode;
                return bounds;
            }
        } else if(!this.support.rangeBounds || container.parent.hasTransform()){
            container.node = container.node.splitText(text.length);
        }
        return {};
    };
};

NodeParser.prototype.getWrapperBounds = function(node, transform) {
    var wrapper = node.ownerDocument.createElement('html2canvaswrapper');
    var parent = node.parentNode,
        backupText = node.cloneNode(true);

    wrapper.appendChild(node.cloneNode(true));
    parent.replaceChild(wrapper, node);
    var bounds = transform ? offsetBounds(wrapper) : getBounds(wrapper);
    parent.replaceChild(backupText, wrapper);
    return bounds;
};

NodeParser.prototype.getRangeBounds = function(node, offset, length) {
    var range = this.range || (this.range = node.ownerDocument.createRange());
    range.setStart(node, offset);
    range.setEnd(node, offset + length);
    return range.getBoundingClientRect();
};

function ClearTransform() {}

NodeParser.prototype.parse = function(stack) {
    // http://www.w3.org/TR/CSS21/visuren.html#z-index
    var negativeZindex = stack.contexts.filter(negativeZIndex); // 2. the child stacking contexts with negative stack levels (most negative first).
    var descendantElements = stack.children.filter(isElement);
    var descendantNonFloats = descendantElements.filter(not(isFloating));
    var nonInlineNonPositionedDescendants = descendantNonFloats.filter(not(isPositioned)).filter(not(inlineLevel)); // 3 the in-flow, non-inline-level, non-positioned descendants.
    var nonPositionedFloats = descendantElements.filter(not(isPositioned)).filter(isFloating); // 4. the non-positioned floats.
    var inFlow = descendantNonFloats.filter(not(isPositioned)).filter(inlineLevel); // 5. the in-flow, inline-level, non-positioned descendants, including inline tables and inline blocks.
    var stackLevel0 = stack.contexts.concat(descendantNonFloats.filter(isPositioned)).filter(zIndex0); // 6. the child stacking contexts with stack level 0 and the positioned descendants with stack level 0.
    var text = stack.children.filter(isTextNode).filter(hasText);
    var positiveZindex = stack.contexts.filter(positiveZIndex); // 7. the child stacking contexts with positive stack levels (least positive first).
    negativeZindex.concat(nonInlineNonPositionedDescendants).concat(nonPositionedFloats)
        .concat(inFlow).concat(stackLevel0).concat(text).concat(positiveZindex).forEach(function(container) {
//console.log(container.node);
            this.renderQueue.push(container);
            if (isStackingContext(container)) {
                this.parse(container);
                this.renderQueue.push(new ClearTransform());
            }
        }, this);
};

NodeParser.prototype.paint = function(container) {
    if (this.options.canceled) {
        return;
    }

    try {
        var isParentPseudoElement = container.parent && isPseudoElement(container.parent);
        if (isParentPseudoElement) {
            container.parent.appendToDOM();
        }

        if (container instanceof ClearTransform) {
            this.renderer.ctx.restore();
        } else if (isTextNode(container)) {
            this.paintText(container);
        } else {
            this.paintNode(container);
        }

        if (isParentPseudoElement) {
            container.parent.cleanDOM();
        }
    } catch(e) {
        log(e);
        if (this.options.strict) {
            throw e;
        }
    }
};

NodeParser.prototype.paintNode = function(container) {
    if (isStackingContext(container)) {
        this.renderer.setOpacity(container.opacity);
        this.renderer.ctx.save();

        if (container.hasTransform()) {
            this.renderer.setTransform(container.parseTransform());
        }
    }

    var mixBlendMode = container.css("mixBlendMode");
    if (mixBlendMode) {
        this.renderer.setMixBlendMode(mixBlendMode);
    }

    var filter = container.css("filter");
    if (filter) {
        this.renderer.setFilter(filter);
    }

    if (container.node.nodeName === "INPUT" && container.node.type === "checkbox") {
        this.paintCheckbox(container);
    } else if (container.node.nodeName === "INPUT" && container.node.type === "radio") {
        this.paintRadio(container);
    } else {
        this.paintElement(container);
    }
};

NodeParser.prototype.paintElement = function(container) {
//console.log(container.node);
    var bounds = container.parseBounds();

    this.renderer.clip(container.backgroundClip, function() {
        this.renderer.renderBackground(container, bounds, container.borders.borders.map(getWidth));
    }, this, container);

    this.renderer.mask(container.backgroundClip, function() {
        this.renderer.renderShadows(container, container.borders.clip, null, false);
    }, this, container);

    var clip = container.backgroundClip;
    if (container.node.nodeName === "LI") {
        var parent = this.getParentOfType(container, ["OL", "UL"]);
        clip = parent.css("overflow") !== "visible" ? parent.backgroundClip : null;
    } else if (container.node.nodeName === "IMG" && isPseudoElement(container.parent)) {
        clip = null;
    }

    this.renderer.clip(clip, function() {
        switch (container.node.nodeName) {
        case "svg":
        case "IFRAME":
            var imgContainer = this.images.get(container.node);
            if (imgContainer) {
                this.renderer.renderImage(container, bounds, container.borders, imgContainer);
            } else {
                log("Error loading <" + container.node.nodeName + ">", container.node);
            }
            break;
        case "IMG":
            var imageContainer = this.images.get(container.node.currentSrc || container.node.src);
            if (imageContainer) {
                this.renderer.renderImage(container, bounds, container.borders, imageContainer);
            } else {
                log("Error loading <img>", container.node.currentSrc || container.node.src);
            }
            break;
        case "VIDEO":
            var videoContainer = this.images.getVideo(container.node.videoIndex);
            if (videoContainer) {
                this.renderer.renderImage(container, bounds, container.borders, videoContainer);
            } else {
                log("Error loading <video>", container.node.src);
            }
            break;
        case "CANVAS":
            this.renderer.renderImage(container, bounds, container.borders, {image: container.node});
            break;
        case "LI":
            this.paintListItem(container);
            break;
        case "SELECT":
        case "INPUT":
        case "TEXTAREA":
            this.paintFormValue(container);
            break;
        }

        this.renderer.renderShadows(container, container.backgroundClip, container.borders, true);
    }, this, container);

    this.renderer.clip(container.clip, function() {
        this.renderer.renderBorders(container.borders.borders);
    }, this, container);
};

NodeParser.prototype.paintCheckbox = function(container) {
    var b = container.parseBounds();

    var size = Math.min(b.width, b.height);
    var bounds = {width: size - 1, height: size - 1, top: b.top, left: b.left};
    var r = [3, 3];
    var radius = [r, r, r, r];
    var borders = [1,1,1,1].map(function(w) {
        return {color: new Color('#A5A5A5'), width: w};
    });

    var borderPoints = calculateCurvePoints(bounds, radius, borders);

    this.renderer.clip(container.backgroundClip, function() {
        this.renderer.rectangle(bounds.left + 1, bounds.top + 1, bounds.width - 2, bounds.height - 2, new Color("#DEDEDE"));
        this.renderer.renderBorders(calculateBorders(borders, bounds, borderPoints, radius));
        if (container.node.checked) {
            this.renderer.font(new Color('#424242'), 'normal', 'normal', 'bold', (size - 3) + "px", 'arial');
            this.renderer.text("\u2714", bounds.left + size / 6, bounds.top + size - 1);
        }
    }, this, container);
};

NodeParser.prototype.paintRadio = function(container) {
    var bounds = container.parseBounds();

    var size = Math.min(bounds.width, bounds.height) - 2;

    this.renderer.clip(container.backgroundClip, function() {
        this.renderer.circleStroke(bounds.left + 1, bounds.top + 1, size, new Color('#DEDEDE'), 1, new Color('#A5A5A5'));
        if (container.node.checked) {
            this.renderer.circle(Math.ceil(bounds.left + size / 4) + 1, Math.ceil(bounds.top + size / 4) + 1, Math.floor(size / 2), new Color('#424242'));
        }
    }, this, container);
};

var getPropertyValue = function(container, propertyName, placeholderRules) {
    if (!placeholderRules) {
        return container.css(propertyName);
    }

    for (var i = placeholderRules.length - 1; i >= 0; i--) {
        var value = placeholderRules[i].style[propertyName];
        if (value) {
            return value;
        }
    }

    return container.css(propertyName);
};

NodeParser.prototype.paintIntrinsicTextNode = function(container, value, canHavePlaceholder, isOutside) {
    var isPlaceholder = canHavePlaceholder ? container.isPlaceholderShown() : false;
    if (value.length > 0) {
        var document = container.node.ownerDocument;
        var wrapper = document.createElement('html2canvaswrapper');
        var properties = [
            'lineHeight', 'textAlign', 'fontFamily', 'fontWeight', 'fontSize', 'color',
            'paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom',
            'width', 'height', 'borderLeftStyle', 'borderTopStyle', 'borderLeftWidth', 'borderTopWidth',
            'boxSizing', 'whiteSpace', 'wordWrap'
        ];
        var lenProperties = properties.length;
        var placeholderRules = isPlaceholder ? getMatchingRules(container.node, /::placeholder|::-webkit-input-placeholder|::?-moz-placeholder|:-ms-input-placeholder/) : null;

        for (var i = 0; i < lenProperties; i++) {
            var property = properties[i];
            try {
                wrapper.style[property] = getPropertyValue(container, property, placeholderRules);
            } catch(e) {
                // Older IE has issues with "border"
                log("html2canvas: Parse: Exception caught in renderFormValue: " + e.message);
            }
        }

        var bounds = container.parseBounds();

        wrapper.style.position = "fixed";
        wrapper.style.top = bounds.top + "px";

        if (isOutside) {
            // paint the text outside the box, i.e., right-aligned to the left of the box
            wrapper.style.left = 'auto';
            var windowWidth = window.innerWidth || document.documentElement.clientWidth;
            wrapper.style.right = (windowWidth - bounds.left + 4) + "px";
            wrapper.style.textAlign = 'right';
        } else {
            wrapper.style.left = bounds.left + "px";
        }

        wrapper.textContent = value;

        if (wrapper.style.lineHeight === 'normal') {
            wrapper.style.lineHeight = container.computedStyles.height;
        }

        document.body.appendChild(wrapper);
        this.paintText(new TextContainer(wrapper.firstChild, new NodeContainer(wrapper, container)));
        document.body.removeChild(wrapper);
    }
};

NodeParser.prototype.paintFormValue = function(container) {
    var value = container.getValue();
    this.paintIntrinsicTextNode(container, container.getValue(), true, false);
};

NodeParser.prototype.getParentOfType = function(container, parentTypes) {
    var parent = container.parent;

    while (parentTypes.indexOf(parent.node.tagName) < 0) {
        parent = parent.parent;
        if (!parent) {
            return null;
        }
    }

    return parent;
};

NodeParser.prototype.getParentNodeOfType = function(node, parentTypes) {
    var parent = node.parentNode;

    while (parentTypes.indexOf(parent.tagName) < 0) {
        parent = parent.parentNode;
        if (!parent) {
            return null;
        }
    }

    return parent;
};

NodeParser.prototype.paintListItem = function(container) {
    var isOutside = container.css("listStylePosition") === "outside";
    if (container.listStyleImage && container.listStyleImage.method !== "none") {
        // image enumeration symbol
        this.renderer.renderListStyleImage(container, container.parseBounds(), isOutside);
    } else {
        // textual enumeration symbol/number

        // find the parent OL/UL
        var listTypes = ["OL", "UL"];
        var listContainer = this.getParentOfType(container, listTypes);

        if (listContainer) {
            // compute the enumeration number
            var value = 1;
            var start = listContainer && listContainer.node.getAttribute("start");
            if (start !== null) {
                value = parseInt(start, 10);
            }

            var listItems = listContainer.node.querySelectorAll("li");
            var lenListItems = listItems.length;
            for (var i = 0; i < lenListItems; i++) {
                var li = listItems[i];
                if (container.node === li) {
                    break;
                }
                if (this.getParentNodeOfType(li, listTypes) === listContainer.node) {
                    ++value;
                }
            }

            // paint the text
            this.paintIntrinsicTextNode(container, ListStyleTypeFormatter.format(value, container.css("listStyleType")), false, isOutside);
        }
    }
};

NodeParser.prototype.paintText = function(container) {
    container.applyTextTransform();
    var characters = punycode.ucs2.decode(container.node.data);

    // MCH: allow letter rendering only for latin/cyrillic/greek scripts -->
    //var wordRendering = (!this.options.letterRendering || noLetterSpacing(container)) && !hasUnicode(container.node.data);
    var wordRendering = !isLatinCyrillicGreek(container.node.data) || !this.options.letterRendering || noLetterSpacing(container); // && !hasUnicode(container.node.data);
    // <--

    var textList = wordRendering ? getWords(characters) : characters.map(function(character) {
        return punycode.ucs2.encode([character]);
    });
    console.log(textList);
    if (!wordRendering) {
        container.parent.node.style.fontVariantLigatures = 'none';
    }

    var weight = container.parent.fontWeight();
    var size = container.parent.css('fontSize');
    var family = container.parent.css('fontFamily');
    var shadows = container.parent.parseTextShadows();

    this.renderer.font(container.parent.color('color'), container.parent.css('fontStyle'), container.parent.css('fontVariant'), weight, size, family);
    if (shadows.length) {
        // TODO: support multiple text shadows
        // TODO: comment this out once "renderTextShadow" works correctly
        this.renderer.fontShadow(shadows[0].color, shadows[0].offsetX, shadows[0].offsetY, shadows[0].blur);
    } else {
        this.renderer.clearShadow();
    }

    this.renderer.clip(container.parent.clip, function() {
        textList.map(this.parseTextBounds(container), this).forEach(function(bounds, index) {
            if (bounds) {
                // https://github.com/niklasvh/html2canvas/pull/908/commits/8a05595ecd2b437694fd54005639f397fb8bafc1
                // MCH: TODO: renderTextShadow doesn't work with letter-spacing
                //if (shadows.length) {
                //    this.renderer.renderTextShadow(textList[index], bounds, shadows);
                //} else {
                this.renderer.text(textList[index], bounds.left, bounds.bottom);
                //}
                this.renderTextDecoration(container.parent, bounds, this.fontMetrics.getMetrics(family, size));
            }
        }, this);
    }, this, container.parent);
};

NodeParser.prototype.renderTextDecoration = function(container, bounds, metrics) {
    switch(container.css("textDecoration").split(" ")[0]) {
    case "underline":
        // Draws a line at the baseline of the font
        // TODO As some browsers display the line as more than 1px if the font-size is big, need to take that into account both in position and size
        this.renderer.rectangle(bounds.left, Math.round(bounds.top + metrics.baseline + metrics.lineWidth), bounds.width, 1, container.color("color"));
        break;
    case "overline":
        this.renderer.rectangle(bounds.left, Math.round(bounds.top), bounds.width, 1, container.color("color"));
        break;
    case "line-through":
        // TODO try and find exact position for line-through
        this.renderer.rectangle(bounds.left, Math.ceil(bounds.top + metrics.middle + metrics.lineWidth), bounds.width, 1, container.color("color"));
        break;
    }
};

var borderColorTransforms = {
    inset: [
        ["darken", 0.60],
        ["darken", 0.10],
        ["darken", 0.10],
        ["darken", 0.60]
    ]
};

NodeParser.prototype.parseBorders = function(container) {
    var nodeBounds = container.parseBounds();
    var radius = getBorderRadiusData(container);
    var borders = ["Top", "Right", "Bottom", "Left"].map(function(side, index) {
        var style = container.css('border' + side + 'Style');
        var color = container.color('border' + side + 'Color');
        if (style === "inset" && color.isBlack()) {
            color = new Color([255, 255, 255, color.a]); // this is wrong, but
        }
        var colorTransform = borderColorTransforms[style] ? borderColorTransforms[style][index] : null;
        return {
            width: container.cssInt('border' + side + 'Width'),
            color: colorTransform ? color[colorTransform[0]](colorTransform[1]) : color,
            style: style,
            pathArgs: null,
            args: null
        };
    });
    var borderPoints = calculateCurvePoints(nodeBounds, radius, borders);

    return {
        clip: this.parseBackgroundClip(container, borderPoints, borders, radius, nodeBounds),
        borders: calculateBorders(borders, nodeBounds, borderPoints, radius)
    };
};

function calculateBorders(borders, nodeBounds, borderPoints, radius) {
    var pathBounds = {
        top: nodeBounds.top + borders[0].width/2,
        right: nodeBounds.right - borders[1].width/2,
        bottom: nodeBounds.bottom - borders[2].width/2,
        left: nodeBounds.left + borders[3].width/2
    };
    return borders.map(function(border, borderSide) {
        if (border.width > 0) {
            var bx = nodeBounds.left;
            var by = nodeBounds.top;
            var bw = nodeBounds.width;
            var bh = nodeBounds.height - (borders[2].width);

            switch(borderSide) {
            case 0:
                // top border
                bh = borders[0].width;
                border.args = drawSide({
                        c1: [bx, by],
                        c2: [bx + bw, by],
                        c3: [bx + bw - borders[1].width, by + bh],
                        c4: [bx + borders[3].width, by + bh]
                    }, radius[0], radius[1],
                    borderPoints.topLeftOuter, borderPoints.topLeftInner, borderPoints.topRightOuter, borderPoints.topRightInner);
                border.pathArgs = drawSidePath({
                        c1: [pathBounds.left, pathBounds.top],
                        c2: [pathBounds.right, pathBounds.top]
                    }, radius[0], radius[1],
                    borderPoints.topLeft, borderPoints.topRight);
                break;
            case 1:
                // right border
                bx = nodeBounds.left + nodeBounds.width - (borders[1].width);
                bw = borders[1].width;

                border.args = drawSide({
                        c1: [bx + bw, by],
                        c2: [bx + bw, by + bh + borders[2].width],
                        c3: [bx, by + bh],
                        c4: [bx, by + borders[0].width]
                    }, radius[1], radius[2],
                    borderPoints.topRightOuter, borderPoints.topRightInner, borderPoints.bottomRightOuter, borderPoints.bottomRightInner);
                border.pathArgs = drawSidePath({
                        c1: [pathBounds.right, pathBounds.top],
                        c2: [pathBounds.right, pathBounds.bottom]
                    }, radius[1], radius[2],
                    borderPoints.topRight, borderPoints.bottomRight);
                break;
            case 2:
                // bottom border
                by = (by + nodeBounds.height) - (borders[2].width);
                bh = borders[2].width;
                border.args = drawSide({
                        c1: [bx + bw, by + bh],
                        c2: [bx, by + bh],
                        c3: [bx + borders[3].width, by],
                        c4: [bx + bw - borders[3].width, by]
                    }, radius[2], radius[3],
                    borderPoints.bottomRightOuter, borderPoints.bottomRightInner, borderPoints.bottomLeftOuter, borderPoints.bottomLeftInner);
                border.pathArgs = drawSidePath({
                        c1: [pathBounds.right, pathBounds.bottom],
                        c2: [pathBounds.left, pathBounds.bottom]
                    }, radius[2], radius[3],
                    borderPoints.bottomRight, borderPoints.bottomLeft);
                break;
            case 3:
                // left border
                bw = borders[3].width;
                border.args = drawSide({
                        c1: [bx, by + bh + borders[2].width],
                        c2: [bx, by],
                        c3: [bx + bw, by + borders[0].width],
                        c4: [bx + bw, by + bh]
                    }, radius[3], radius[0],
                    borderPoints.bottomLeftOuter, borderPoints.bottomLeftInner, borderPoints.topLeftOuter, borderPoints.topLeftInner);
                border.pathArgs = drawSidePath({
                        c1: [pathBounds.left, pathBounds.bottom],
                        c2: [pathBounds.left, pathBounds.top]
                    }, radius[3], radius[0],
                    borderPoints.bottomLeft, borderPoints.topLeft);
                break;
            }
        }
        return border;
    });
}

NodeParser.prototype.parseBackgroundClip = function(container, borderPoints, borders, radius, bounds) {
    var backgroundClip = container.css('backgroundClip'),
        borderArgs = [];

    switch(backgroundClip) {
    case "content-box":
    case "padding-box":
        parseCorner(borderArgs, radius[0], radius[1], borderPoints.topLeftInner, borderPoints.topRightInner, bounds.left + borders[3].width, bounds.top + borders[0].width);
        parseCorner(borderArgs, radius[1], radius[2], borderPoints.topRightInner, borderPoints.bottomRightInner, bounds.left + bounds.width - borders[1].width, bounds.top + borders[0].width);
        parseCorner(borderArgs, radius[2], radius[3], borderPoints.bottomRightInner, borderPoints.bottomLeftInner, bounds.left + bounds.width - borders[1].width, bounds.top + bounds.height - borders[2].width);
        parseCorner(borderArgs, radius[3], radius[0], borderPoints.bottomLeftInner, borderPoints.topLeftInner, bounds.left + borders[3].width, bounds.top + bounds.height - borders[2].width);
        break;

    default:
        parseCorner(borderArgs, radius[0], radius[1], borderPoints.topLeftOuter, borderPoints.topRightOuter, bounds.left, bounds.top);
        parseCorner(borderArgs, radius[1], radius[2], borderPoints.topRightOuter, borderPoints.bottomRightOuter, bounds.left + bounds.width, bounds.top);
        parseCorner(borderArgs, radius[2], radius[3], borderPoints.bottomRightOuter, borderPoints.bottomLeftOuter, bounds.left + bounds.width, bounds.top + bounds.height);
        parseCorner(borderArgs, radius[3], radius[0], borderPoints.bottomLeftOuter, borderPoints.topLeftOuter, bounds.left, bounds.top + bounds.height);
        break;
    }

    return borderArgs;
};

function getCurvePoints(x, y, r1, r2) {
    var kappa = 4 * ((Math.sqrt(2) - 1) / 3);
    var ox = (r1) * kappa, // control point offset horizontal
        oy = (r2) * kappa, // control point offset vertical
        xm = x + r1, // x-middle
        ym = y + r2; // y-middle
    return {
        topLeft: bezierCurve({x: x, y: ym}, {x: x, y: ym - oy}, {x: xm - ox, y: y}, {x: xm, y: y}),
        topRight: bezierCurve({x: x, y: y}, {x: x + ox,y: y}, {x: xm, y: ym - oy}, {x: xm, y: ym}),
        bottomRight: bezierCurve({x: xm, y: y}, {x: xm, y: y + oy}, {x: x + ox, y: ym}, {x: x, y: ym}),
        bottomLeft: bezierCurve({x: xm, y: ym}, {x: xm - ox, y: ym}, {x: x, y: y + oy}, {x: x, y:y})
    };
}

function calculateCurvePoints(bounds, borderRadius, borders) {
    var x = bounds.left,
        y = bounds.top,
        width = bounds.width,
        height = bounds.height;

    // https://www.w3.org/TR/css3-background/#corner-overlap:
    // Corner curves must not overlap: When the sum of any two adjacent border radii exceeds
    // the size of the border box, UAs must proportionally reduce the used values of all border
    // radii until none of them overlap. The algorithm for reducing radii is as follows:
    // Let f = min(L_i/S_i), where i ∈ {top, right, bottom, left}, S_i is the sum of the two
    // corresponding radii of the corners on side i, and L_top = L_bottom = the width of the box,
    // and L_left = L_right = the height of the box.
    // If f < 1, then all corner radii are reduced by multiplying them by f.

    var f = Math.min(
        1,
        width / (borderRadius[0][0] + borderRadius[1][0]),
        height / (borderRadius[1][borderRadius[1][1] === undefined ? 0 : 1] + borderRadius[2][borderRadius[2][1] === undefined ? 0 : 1]),
        width / (borderRadius[2][0] + borderRadius[3][0]),
        height / (borderRadius[3][borderRadius[3][1] === undefined ? 0 : 1] + borderRadius[0][borderRadius[0][1] === undefined ? 0 : 1]));

    var h = [],
        v = [];

    for (var i = 0; i < 4; i++) {
        if (borderRadius[0][1] === undefined) {
            var a = f * borderRadius[i][0];
            h.push(a);
            v.push(a);
        } else {
            h.push(f * borderRadius[i][0]);
            v.push(f * borderRadius[i][1]);
        }
    }

    var topWidth = width - h[1],
        rightHeight = height - v[2],
        bottomWidth = width - h[2],
        leftHeight = height - v[3];

    return {
        topLeft: getCurvePoints(x + borders[3].width/2, y + borders[0].width/2, Math.max(0, h[0] - borders[3].width/2), Math.max(0, v[0] - borders[0].width/2)).topLeft.subdivide(0.5),
        topRight: getCurvePoints(x + Math.min(topWidth, width + borders[3].width/2), y + borders[0].width/2, (topWidth > width + borders[3].width/2) ? 0 : h[1] - borders[3].width/2, v[1] - borders[0].width/2).topRight.subdivide(0.5),
        bottomRight: getCurvePoints(x + Math.min(bottomWidth, width - borders[3].width/2), y + Math.min(rightHeight, height + borders[0].width/2), Math.max(0, h[2] - borders[1].width/2),  v[2] - borders[2].width/2).bottomRight.subdivide(0.5),
        bottomLeft: getCurvePoints(x + borders[3].width/2, y + leftHeight, Math.max(0, h[3] - borders[3].width/2), v[3] - borders[2].width/2).bottomLeft.subdivide(0.5),

        topLeftOuter: getCurvePoints(x, y, h[0], v[0]).topLeft.subdivide(0.5),
        topLeftInner: getCurvePoints(x + borders[3].width, y + borders[0].width, Math.max(0, h[0] - borders[3].width), Math.max(0, v[0] - borders[0].width)).topLeft.subdivide(0.5),
        topRightOuter: getCurvePoints(x + topWidth, y, h[1], v[1]).topRight.subdivide(0.5),
        topRightInner: getCurvePoints(x + Math.min(topWidth, width + borders[3].width), y + borders[0].width, (topWidth > width + borders[3].width) ? 0 :h[1] - borders[3].width, v[1] - borders[0].width).topRight.subdivide(0.5),
        bottomRightOuter: getCurvePoints(x + bottomWidth, y + rightHeight, h[2], v[2]).bottomRight.subdivide(0.5),
        bottomRightInner: getCurvePoints(x + Math.min(bottomWidth, width - borders[3].width), y + Math.min(rightHeight, height + borders[0].width), Math.max(0, h[2] - borders[1].width),  v[2] - borders[2].width).bottomRight.subdivide(0.5),
        bottomLeftOuter: getCurvePoints(x, y + leftHeight, h[3], v[3]).bottomLeft.subdivide(0.5),
        bottomLeftInner: getCurvePoints(x + borders[3].width, y + leftHeight, Math.max(0, h[3] - borders[3].width), v[3] - borders[2].width).bottomLeft.subdivide(0.5)
    };
}

function bezierCurve(start, startControl, endControl, end) {
    var lerp = function (a, b, t) {
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t
        };
    };

    return {
        start: start,
        startControl: startControl,
        endControl: endControl,
        end: end,
        subdivide: function(t) {
            var ab = lerp(start, startControl, t),
                bc = lerp(startControl, endControl, t),
                cd = lerp(endControl, end, t),
                abbc = lerp(ab, bc, t),
                bccd = lerp(bc, cd, t),
                dest = lerp(abbc, bccd, t);
            return [bezierCurve(start, ab, abbc, dest), bezierCurve(dest, bccd, cd, end)];
        },
        curveTo: function(borderArgs) {
            borderArgs.push(["bezierCurve", startControl.x, startControl.y, endControl.x, endControl.y, end.x, end.y]);
        },
        curveToReversed: function(borderArgs) {
            borderArgs.push(["bezierCurve", endControl.x, endControl.y, startControl.x, startControl.y, start.x, start.y]);
        }
    };
}

function drawSide(borderData, radius1, radius2, outer1, inner1, outer2, inner2) {
    var borderArgs = [];

    if (radius1[0] > 0 || radius1[1] > 0) {
        borderArgs.push(["line", outer1[1].start.x, outer1[1].start.y]);
        outer1[1].curveTo(borderArgs);
    } else {
        borderArgs.push([ "line", borderData.c1[0], borderData.c1[1]]);
    }

    if (radius2[0] > 0 || radius2[1] > 0) {
        borderArgs.push(["line", outer2[0].start.x, outer2[0].start.y]);
        outer2[0].curveTo(borderArgs);
        borderArgs.push(["line", inner2[0].end.x, inner2[0].end.y]);
        inner2[0].curveToReversed(borderArgs);
    } else {
        borderArgs.push(["line", borderData.c2[0], borderData.c2[1]]);
        borderArgs.push(["line", borderData.c3[0], borderData.c3[1]]);
    }

    if (radius1[0] > 0 || radius1[1] > 0) {
        borderArgs.push(["line", inner1[1].end.x, inner1[1].end.y]);
        inner1[1].curveToReversed(borderArgs);
    } else {
        borderArgs.push(["line", borderData.c4[0], borderData.c4[1]]);
    }

    return borderArgs;
}

function drawSidePath(borderData, radius1, radius2, curve1, curve2) {
    var borderArgs = [];
    if (radius1[0] > 0 || radius1[1] > 0) {
        borderArgs.push(["line", curve1[1].start.x, curve1[1].start.y]);
        curve1[1].curveTo(borderArgs);
    } else {
        borderArgs.push([ "line", borderData.c1[0], borderData.c1[1]]);
    }
    if (radius2[0] > 0 || radius2[1] > 0) {
        borderArgs.push(["line", curve2[0].start.x, curve2[0].start.y]);
        curve2[0].curveTo(borderArgs);
    } else {
        borderArgs.push([ "line", borderData.c2[0], borderData.c2[1]]);
    }

    return borderArgs;
}

function parseCorner(borderArgs, radius1, radius2, corner1, corner2, x, y) {
    if (radius1[0] > 0 || radius1[1] > 0) {
        borderArgs.push(["line", corner1[0].start.x, corner1[0].start.y]);
        corner1[0].curveTo(borderArgs);
        corner1[1].curveTo(borderArgs);
    } else {
        borderArgs.push(["line", x, y]);
    }

    if (radius2[0] > 0 || radius2[1] > 0) {
        borderArgs.push(["line", corner2[0].start.x, corner2[0].start.y]);
    }
}

function negativeZIndex(container) {
    return container.cssInt("zIndex") < 0;
}

function positiveZIndex(container) {
    return container.cssInt("zIndex") > 0;
}

function zIndex0(container) {
    return container.cssInt("zIndex") === 0;
}

function inlineLevel(container) {
    return ["inline", "inline-block", "inline-table"].indexOf(container.css("display")) !== -1;
}

function isStackingContext(container) {
    return (container instanceof StackingContext);
}

function hasText(container) {
    return container.node.data.trim().length > 0;
}

function noLetterSpacing(container) {
    return (/^(normal|none|0px)$/.test(container.parent.css("letterSpacing")));
}

function getBorderRadiusData(container) {
    return ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map(function(side) {
        var value = container.css('border' + side + 'Radius');
        var arr = value.split(" ");

        switch (arr.length) {
        case 0:
            return [0];
        case 1:
            var v = parseFloat(arr[0]);
            if (typeof arr[0] === 'string' && arr[0].charAt(arr[0].length - 1) === '%') {
                return [v / 100 * container.bounds.width, v / 100 * container.bounds.height];
            }
            return [v];
        default:
            return [
                typeof arr[0] === 'string' && arr[0].charAt(arr[0].length - 1) === '%' ? parseFloat(arr[0]) / 100 * container.bounds.width : parseFloat(arr[0]),
                typeof arr[1] === 'string' && arr[1].charAt(arr[1].length - 1) === '%' ? parseFloat(arr[1]) / 100 * container.bounds.height : parseFloat(arr[1])
            ];
        }
    });
}

function renderableNode(node) {
    return (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE);
}

function isPositionedForStacking(container, hasSiblingWithOwnStacking) {
    var position = container.css("position");
    var isNonStaticPosition = ["absolute", "relative", "fixed"].indexOf(position) !== -1;

    // MCH -->
    if (hasSiblingWithOwnStacking) {
        // if container has a sibling with its own stacking, always create an own
        // stacking context for this container if the node is positioned non-statically
        return isNonStaticPosition;
    }
    // <--

    var zIndex = isNonStaticPosition ? container.css("zIndex") : "auto";
    return zIndex !== "auto";
}

function isPositioned(container) {
    return container.css("position") !== "static";
}

function isFloating(container) {
    return container.css("float") !== "none";
}

function isInlineBlock(container) {
    return ["inline-block", "inline-table"].indexOf(container.css("display")) !== -1;
}

function not(callback) {
    var context = this;
    return function() {
        return !callback.apply(context, arguments);
    };
}

function isElement(container) {
    return container.node.nodeType === Node.ELEMENT_NODE;
}

function isPseudoElement(container) {
    return container.isPseudoElement === true;
}

function isTextNode(container) {
    return container.node.nodeType === Node.TEXT_NODE;
}

function zIndexSort(contexts) {
    return function(a, b) {
        return (a.cssInt("zIndex") + (contexts.indexOf(a) / contexts.length)) - (b.cssInt("zIndex") + (contexts.indexOf(b) / contexts.length));
    };
}

function hasOpacity(container) {
    return container.getOpacity() < 1;
}

function getWidth(border) {
    return border.width;
}

function nonIgnoredElement(nodeContainer) {
    return (nodeContainer.node.nodeType !== Node.ELEMENT_NODE || ["SCRIPT", "HEAD", "TITLE", "OBJECT", "BR", "OPTION"].indexOf(nodeContainer.node.nodeName) === -1);
}

function flatten(arrays) {
    return Array.prototype.concat.apply([], arrays);
}

/*
function stripQuotes(content) {
    var first = content.substr(0, 1);
    return (first === content.substr(content.length - 1) && first.match(/'|"/)) ? content.substr(1, content.length - 2) : content;
}*/

function getWords(characters) {
    var words = [], i = 0, onWordBoundary = false, word;
    while(characters.length) {
        if (isWordBoundary(characters[i]) === onWordBoundary) {
            word = characters.splice(0, i);
            if (word.length) {
                words.push(punycode.ucs2.encode(word));
            }
            onWordBoundary =! onWordBoundary;
            i = 0;
        } else {
            i++;
        }

        if (i >= characters.length) {
            word = characters.splice(0, i);
            if (word.length) {
                words.push(punycode.ucs2.encode(word));
            }
        }
    }
    return words;
}

function isWordBoundary(characterCode) {
    return [
        32, // <space>
        13, // \r
        10, // \n
        9, // \t
        45 // -
    ].indexOf(characterCode) !== -1;
}

function hasUnicode(string) {
    return (/[^\u0000-\u00ff]/).test(string);
}

/*
function isArabic(s) {
    return /[\u0600-\u06FF]/.test(s);
}*/

function isLatinCyrillicGreek(s) {
    return !/[^\u0000-\u052f\u1d00-\u2bff\u2c60-\u2c7f\u2de0-\u2e7f]/.test(s);
}

module.exports = NodeParser;

},{"./color":11,"./fontmetrics":15,"./log":21,"./nodecontainer":22,"./pseudoelementcontainer":25,"./stackingcontext":31,"./textcontainer":35,"./utils":36,"liststyletype-formatter":7,"punycode":1}],24:[function(_dereq_,module,exports){
var XHR = _dereq_('./xhr');
var utils = _dereq_('./utils');
var log = _dereq_('./log');
var createWindowClone = _dereq_('./clone');
var decode64 = utils.decode64;

function Proxy(src, proxyUrl, document) {
    var supportsCORS = ('withCredentials' in new XMLHttpRequest());
    if (!proxyUrl) {
        return Promise.reject("No proxy configured");
    }
    var callback = createCallback(supportsCORS);
    var url = createProxyUrl(proxyUrl, src, callback);

    return supportsCORS ? XHR(url) : (jsonp(document, url, callback).then(function(response) {
        return decode64(response.content);
    }));
}
var proxyCount = 0;

function ProxyURL(src, proxyUrl, document) {
    var supportsCORSImage = ('crossOrigin' in new Image());
    var callback = createCallback(supportsCORSImage);
    var url = createProxyUrl(proxyUrl, src, callback);
    return (supportsCORSImage ? Promise.resolve(url) : jsonp(document, url, callback).then(function(response) {
        return "data:" + response.type + ";base64," + response.content;
    }));
}

function jsonp(document, url, callback) {
    return new Promise(function(resolve, reject) {
        var s = document.createElement("script");
        var cleanup = function() {
            delete window.html2canvas.proxy[callback];
            document.body.removeChild(s);
        };
        window.html2canvas.proxy[callback] = function(response) {
            cleanup();
            resolve(response);
        };
        s.src = url;
        s.onerror = function(e) {
            cleanup();
            reject(e);
        };
        document.body.appendChild(s);
    });
}

function createCallback(useCORS) {
    return !useCORS ? "html2canvas_" + Date.now() + "_" + (++proxyCount) + "_" + Math.round(Math.random() * 100000) : "";
}

function createProxyUrl(proxyUrl, src, callback) {
    return proxyUrl + "?url=" + encodeURIComponent(src) + (callback.length ? "&callback=html2canvas.proxy." + callback : "");
}

function documentFromHTML(src) {
    return function(html) {
        var parser = new DOMParser(), doc;
        try {
            doc = parser.parseFromString(html, "text/html");
        } catch(e) {
            log("DOMParser not supported, falling back to createHTMLDocument");
            doc = document.implementation.createHTMLDocument("");
            try {
                doc.open();
                doc.write(html);
                doc.close();
            } catch(ee) {
                log("createHTMLDocument write not supported, falling back to document.body.innerHTML");
                doc.body.innerHTML = html; // ie9 doesnt support writing to documentElement
            }
        }

        var b = doc.querySelector("base");
        if (!b || !b.href.host) {
            var base = doc.createElement("base");
            base.href = src;
            doc.head.insertBefore(base, doc.head.firstChild);
        }

        return doc;
    };
}

function loadUrlDocument(src, proxy, document, width, height, options) {
    return new Proxy(src, proxy, window.document).then(documentFromHTML(src)).then(function(doc) {
        return createWindowClone(doc, document, width, height, options, 0, 0);
    });
}

exports.Proxy = Proxy;
exports.ProxyURL = ProxyURL;
exports.loadUrlDocument = loadUrlDocument;

},{"./clone":10,"./log":21,"./utils":36,"./xhr":39}],25:[function(_dereq_,module,exports){
var NodeContainer = _dereq_('./nodecontainer');

function PseudoElementContainer(node, parent, type) {
    NodeContainer.call(this, node, parent);
    this.isPseudoElement = true;
    this.before = type === ":before";
}

PseudoElementContainer.prototype.cloneTo = function(stack) {
    PseudoElementContainer.prototype.cloneTo.call(this, stack);
    stack.isPseudoElement = true;
    stack.before = this.before;
};

PseudoElementContainer.prototype = Object.create(NodeContainer.prototype);

PseudoElementContainer.prototype.appendToDOM = function() {
    if (this.before) {
        this.parent.node.insertBefore(this.node, this.parent.node.firstChild);
    } else {
        this.parent.node.appendChild(this.node);
    }
    this.parent.node.className += " " + this.getHideClass();
};

PseudoElementContainer.prototype.cleanDOM = function() {
    this.node.parentNode.removeChild(this.node);
    this.parent.node.className = this.parent.node.className.replace(this.getHideClass(), "");
};

PseudoElementContainer.prototype.getHideClass = function() {
    return this["PSEUDO_HIDE_ELEMENT_CLASS_" + (this.before ? "BEFORE" : "AFTER")];
};

PseudoElementContainer.prototype.PSEUDO_HIDE_ELEMENT_CLASS_BEFORE = "___html2canvas___pseudoelement_before";
PseudoElementContainer.prototype.PSEUDO_HIDE_ELEMENT_CLASS_AFTER = "___html2canvas___pseudoelement_after";

module.exports = PseudoElementContainer;

},{"./nodecontainer":22}],26:[function(_dereq_,module,exports){
var GradientContainer = _dereq_('./gradientcontainer');
var Color = _dereq_('./color');

function RadialGradientContainer(imageData, container) {
    GradientContainer.apply(this, arguments);
    this.type = GradientContainer.TYPES.RADIAL;

    var rootFontSize;
    var fontSize;
    var node = container && container.node;

    var getFontSize = function(node) {
        if (!node) {
            return 16;
        }

        var style = getComputedStyle(node);
        if (!style) {
            return 16;
        }

        var m = style.fontSize.match(/([\d.]+)(px|r?em|%)/i);
        if (!m) {
            return 16;
        }

        var v = parseFloat(m[1]);

        switch (m[2]) {
        case 'px':
            return v;
        case 'em':
            return v * getFontSize(node.parentElement);
        case 'rem':
            return v * getFontSize((node.ownerDocument || document).body);
        case '%':
            return v * 0.01 * getFontSize(node.parentElement);
        }

        return 16;
    };

    var getPixelOrPercentSize = function(value, unit) {
        var v = parseFloat(value);
        var size;

        switch (unit) {
        case 'px':
            return v;
        case 'em':
            if (!fontSize) {
                fontSize = getFontSize(node);
            }
            return v * fontSize;
        case 'rem':
            if (!rootFontSize) {
                rootFontSize = getFontSize(((node && node.ownerDocument) || document).body);
            }
            return v * rootFontSize;
        case '%':
            return v * 0.01;
        }
    };

    var m = imageData.args[0].match(RadialGradientContainer.REGEXP_SHAPEDEF);
    if (m) {
        this.isCircle =
            m[1] === 'circle' || // explicit shape specification
            (m[3] !== undefined && m[5] === undefined); // only one radius coordinate

        this.radius = {
            descriptor: m[2] || 'farthest-corner'
        };

        if (m[3] !== undefined) {
            this.radius.x = {
                value: getPixelOrPercentSize(m[3], m[4]),
                isRelative: m[4] === '%'
            };
        }
        if (m[5] !== undefined) {
            this.radius.y = {
                value: getPixelOrPercentSize(m[5], m[6]),
                isRelative: m[6] === '%'
            };
        }

        this.position = {};
        if (m[7] !== undefined) {
            this.position.x = {
                value: getPixelOrPercentSize(m[7], m[8]),
                isRelative: m[8] === '%'
            };
        }
        if (m[9] !== undefined) {
            this.position.y = {
                value: getPixelOrPercentSize(m[9], m[10]),
                isRelative: m[10] === '%'
            };
        }

        this.parseColorStops(imageData.args.splice(1));
    } else {
        this.isCircle = false;
        this.radius = { descriptor: 'farthest-corner' };
        this.position = {};

        this.parseColorStops(imageData.args);
    }

    // set values if not set
    if (this.position.x === undefined) {
        // center
        this.position.x = { value: 0.5, isRelative: true };
    }
    if (this.position.y === undefined) {
        this.position.y = { value: 0.5, isRelative: true };
    }
}

RadialGradientContainer.prototype = Object.create(GradientContainer.prototype);

RadialGradientContainer.REGEXP_SHAPEDEF = /^\s*(circle|ellipse)?\s*((?:([\d.]+)(px|r?em|%)\s*(?:([\d.]+)(px|r?em|%))?)|closest-side|closest-corner|farthest-side|farthest-corner)?\s*(?:at\s*([\d.]+)(px|r?em|%)\s+([\d.]+)(px|r?em|%))?(?:\s|$)/i;

module.exports = RadialGradientContainer;

},{"./color":11,"./gradientcontainer":17}],27:[function(_dereq_,module,exports){
var log = _dereq_('./log');
var LinearGradientContainer = _dereq_('./lineargradientcontainer');
var RadialGradientContainer = _dereq_('./radialgradientcontainer');
var RepeatingLinearGradientContainer = _dereq_('./repeatinglineargradientcontainer');
var RepeatingRadialGradientContainer = _dereq_('./repeatingradialgradientcontainer');

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

},{"./lineargradientcontainer":20,"./log":21,"./radialgradientcontainer":26,"./repeatinglineargradientcontainer":29,"./repeatingradialgradientcontainer":30}],28:[function(_dereq_,module,exports){
var Renderer = _dereq_('../renderer');
var GradientContainer = _dereq_('../gradientcontainer');
var utils = _dereq_('../utils');
var log = _dereq_('../log');

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

CanvasRenderer.prototype.getImageContainer = function() {
    return {
        image: this.canvas
    };
};

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
    if (shapes) {
        this.ctx.save();
        shapes.filter(hasEntries).forEach(function(shape) {
            try {
                this.shape(shape).clip();
            } catch(ex) {
                console.log('Exception clipping shape: ', ex);
            }

        }, this);
        callback.call(context);
        this.ctx.restore();
    } else {
        callback.call(context);
    }
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

CanvasRenderer.prototype.path = function(shape) {
    this.ctx.beginPath();
    shape.forEach(function(point, index) {
        if (point[0] === "rect") {
            this.ctx.rect.apply(this.ctx, point.slice(1));
        } else {
            this.ctx[(index === 0) ? "moveTo" : point[0] + "To" ].apply(this.ctx, point.slice(1));
        }
    }, this);
    return this.ctx;
};

CanvasRenderer.prototype.font = function(color, style, variant, weight, size, family) {
    variant = /^(normal|small-caps)$/i.test(variant) ? variant : '';

    // MCH -->
    //
    // this.setFillStyle(color).font = [style, variant, weight, size, family].join(" ").split(",")[0];
    //
    // "split" was introduced here: https://github.com/niklasvh/html2canvas/commit/525b5c4f36d617460e3ba7ed48050cd8fcd1d4c0
    // Not sure why this would be needed (it certainly also prevents certain sites from rendering correctly, e.g.
    // YouTube uses 'font-family: "YouTube Noto", Roboto, arial, sans-serif' and doesn't define the font face "YouTube Noto"
    // (thus, the texts are rendered in Roboto)).

    // use string concatenation instead of the array join: https://jsperf.com/string-concat-vs-array-join-10000/15
    this.setFillStyle(color).font = style + " " + variant + " " + weight + " " + size + " " + family;
    // <--
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

CanvasRenderer.prototype.setMixBlendMode = function(mixBlendMode) {
    this.ctx.globalCompositeOperation = mixBlendMode;
};

CanvasRenderer.prototype.setFilter = function(filter) {
    this.ctx.filter = filter;
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
    if (!this.taints(imageContainer) || this.options.allowTaint) {
        var shape = [
            ["line", Math.round(left), Math.round(top)],
            ["line", Math.round(left + width), Math.round(top)],
            ["line", Math.round(left + width), Math.round(height + top)],
            ["line", Math.round(left), Math.round(height + top)]
        ];
        this.clip([shape], function() {
            this.renderBackgroundRepeat(imageContainer, backgroundPosition, size, bounds, borderData[3], borderData[0]);
        }, this);
    }
};

CanvasRenderer.prototype.renderBackgroundRepeat = function(imageContainer, backgroundPosition, size, bounds, borderLeft, borderTop) {
    if (!this.taints(imageContainer) || this.options.allowTaint) {
        var offsetX = Math.round(bounds.left + backgroundPosition.left + borderLeft), offsetY = Math.round(bounds.top + backgroundPosition.top + borderTop);
        this.setFillStyle(this.ctx.createPattern(this.resizeImage(imageContainer, size), "repeat"));
        this.ctx.translate(offsetX, offsetY);
        this.ctx.fill();
        this.ctx.translate(-offsetX, -offsetY);
    }
};

CanvasRenderer.prototype.renderGradient = function(gradientImage, bounds) {
    var gradient;

    switch (gradientImage.type) {
    case GradientContainer.TYPES.LINEAR:
        gradient = this.ctx.createLinearGradient(gradientImage.x0, gradientImage.y0, gradientImage.x1, gradientImage.y1);
        break;
    case GradientContainer.TYPES.RADIAL:
        if (gradientImage.transform) {
            this.ctx.save();
            this.setTransform(gradientImage.transform);
        }
        gradient = this.ctx.createRadialGradient(gradientImage.cx, gradientImage.cy, 0, gradientImage.cx, gradientImage.cy, gradientImage.r);
        break;
    case GradientContainer.TYPES.REPEATING_LINEAR:
        // TODO
        break;
    case GradientContainer.TYPES.REPEATING_RADIAL:
        // TODO
        break;
    }

    if (gradient) {
        gradientImage.colorStops.forEach(function(colorStop) {
            gradient.addColorStop(colorStop.stop, colorStop.color.toString());
        });

        this.rectangle(bounds.left, bounds.top, bounds.width, bounds.height, gradient);
    }

    if (gradientImage.transform) {
        this.ctx.restore();
    }
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

},{"../gradientcontainer":17,"../log":21,"../renderer":27,"../utils":36}],29:[function(_dereq_,module,exports){
var GradientContainer = _dereq_('./gradientcontainer');
var LinearGradientContainer = _dereq_('./lineargradientcontainer');

function RepeatingLinearGradientContainer(imageData) {
    LinearGradientContainer.apply(this, arguments);
    this.type = GradientContainer.TYPES.REPEATING_LINEAR;
}

RepeatingLinearGradientContainer.prototype = Object.create(LinearGradientContainer.prototype);

module.exports = RepeatingLinearGradientContainer;

},{"./gradientcontainer":17,"./lineargradientcontainer":20}],30:[function(_dereq_,module,exports){
var GradientContainer = _dereq_('./gradientcontainer');
var RadialGradientContainer = _dereq_('./radialgradientcontainer');

function RepeatingRadialGradientContainer(imageData) {
    RadialGradientContainer.apply(this, arguments);
    this.type = GradientContainer.TYPES.REPEATING_RADIAL;
}

RepeatingRadialGradientContainer.prototype = Object.create(RadialGradientContainer.prototype);

module.exports = RepeatingRadialGradientContainer;

},{"./gradientcontainer":17,"./radialgradientcontainer":26}],31:[function(_dereq_,module,exports){
var NodeContainer = _dereq_('./nodecontainer');

function StackingContext(hasOwnStacking, opacity, element, parent) {
    NodeContainer.call(this, element, parent);
    this.ownStacking = hasOwnStacking;
    this.contexts = [];
    this.children = [];
    this.opacity = (this.parent ? this.parent.stack.opacity : 1) * opacity;
}

StackingContext.prototype = Object.create(NodeContainer.prototype);

StackingContext.prototype.getParentStack = function(context) {
    var parentStack = (this.parent) ? this.parent.stack : null;
    return parentStack ? (parentStack.ownStacking ? parentStack : parentStack.getParentStack(context)) : context.stack;
};

module.exports = StackingContext;

},{"./nodecontainer":22}],32:[function(_dereq_,module,exports){
function Support(document) {
    this.rangeBounds = this.testRangeBounds(document);
    this.cors = this.testCORS();
    // this.svg = this.testSVG();
}

Support.prototype.testRangeBounds = function(document) {
    var range, testElement, rangeBounds, rangeHeight, support = false;

    if (document.createRange) {
        range = document.createRange();
        if (range.getBoundingClientRect) {
            testElement = document.createElement('boundtest');
            testElement.style.height = "123px";
            testElement.style.display = "block";
            document.body.appendChild(testElement);

            range.selectNode(testElement);
            rangeBounds = range.getBoundingClientRect();
            rangeHeight = rangeBounds.height;

            if (rangeHeight === 123) {
                support = true;
            }
            document.body.removeChild(testElement);
        }
    }

    return support;
};

Support.prototype.testCORS = function() {
    return typeof((new Image()).crossOrigin) !== "undefined";
};

Support.prototype.testSVG = function() {
    var img = new Image();
    var canvas = document.createElement("canvas");
    var ctx =  canvas.getContext("2d");
    img.src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'></svg>";

    try {
        ctx.drawImage(img, 0, 0);
        canvas.toDataURL();
    } catch(e) {
        return false;
    }
    return true;
};

module.exports = Support;

},{}],33:[function(_dereq_,module,exports){
var XHR = _dereq_('./xhr');
var decode64 = _dereq_('./utils').decode64;

function SVGContainer(src) {
    this.src = src;
    this.image = null;
    var self = this;

    this.promise = this.hasFabric().then(function() {
        return (self.isInline(src) ? Promise.resolve(self.inlineFormatting(src)) : XHR(src));
    }).then(function(svg) {
        return new Promise(function(resolve) {
            window.html2canvas.svg.fabric.loadSVGFromString(svg, self.createCanvas.call(self, resolve));
        });
    });
}

SVGContainer.prototype.hasFabric = function() {
    return !window.html2canvas.svg || !window.html2canvas.svg.fabric ? Promise.reject(new Error("html2canvas.svg.js is not loaded, cannot render svg")) : Promise.resolve();
};

SVGContainer.prototype.inlineFormatting = function(src) {
    return (/^data:image\/svg\+xml;base64,/.test(src)) ? this.decode64(this.removeContentType(src)) : this.removeContentType(src);
};

SVGContainer.prototype.removeContentType = function(src) {
    if (/^data:image\/svg\+xml(;base64)?,/.test(src)) {
       return src.replace(/^data:image\/svg\+xml(;base64)?,/,'');
    }
    else {
        var x = decodeURIComponent(src.replace(/^data:image\/svg\+xml.+,/,''));
        return x;
    }
};

SVGContainer.prototype.isInline = function(src) {
    return (/^data:image\/svg\+xml/i.test(src));
};

SVGContainer.prototype.createCanvas = function(resolve) {
    var self = this;
    return function (objects, options) {
        var c = document.createElement('canvas');
        var canvas = new window.html2canvas.svg.fabric.StaticCanvas(c);
        self.image = canvas.lowerCanvasEl;

        var group = window.html2canvas.svg.fabric.util.groupSVGElements(objects, options),
        bb;

        if (self.src.getBoundingClientRect) {
            bb = self.src.getBoundingClientRect();

            group.set({
                scaleX: bb.width / options.width,
                scaleY: bb.height / options.height
            });
        }


        canvas
            .setWidth(bb ? bb.width : options.width)
            .setHeight(bb ? bb.height : options.height)
            .add(group)
            .renderAll();
        resolve(canvas.lowerCanvasEl);
    };
};

SVGContainer.prototype.decode64 = function(str) {
    return (typeof(window.atob) === "function") ? window.atob(str) : decode64(str);
};

module.exports = SVGContainer;

},{"./utils":36,"./xhr":39}],34:[function(_dereq_,module,exports){
var SVGContainer = _dereq_('./svgcontainer');

function SVGNodeContainer(node, _native) {
    this.src = node;
    this.image = null;
    var self = this;

    this.promise = _native ? new Promise(function(resolve, reject) {
        self.image = new Image();
        self.image.onload = resolve;
        self.image.onerror = reject;
        self.image.src = "data:image/svg+xml," + (new XMLSerializer()).serializeToString(node);
        // var bb = node.getBoundingClientRect();
        // self.image.width = bb.width;
        // self.image.height = bb.height;

        if (self.image.complete === true) {
            resolve(self.image);
        }
    }) : this.hasFabric().then(function() {
        return new Promise(function(resolve) {
            window.html2canvas.svg.fabric.parseSVGDocument(node, self.createCanvas.call(self, resolve));
        });
    });
}

SVGNodeContainer.prototype = Object.create(SVGContainer.prototype);

module.exports = SVGNodeContainer;

},{"./svgcontainer":33}],35:[function(_dereq_,module,exports){
var NodeContainer = _dereq_('./nodecontainer');

function TextContainer(node, parent) {
    NodeContainer.call(this, node, parent);
}

TextContainer.prototype = Object.create(NodeContainer.prototype);

TextContainer.prototype.applyTextTransform = function() {
    this.node.data = this.transform(this.parent.css("textTransform"));
};

TextContainer.prototype.transform = function(transform) {
    var text = this.node.data;
    switch(transform){
        case "lowercase":
            return text.toLowerCase();
        case "capitalize":
            return text.replace(/(^|\s|:|-|\(|\))([a-z])/g, capitalize);
        case "uppercase":
            return text.toUpperCase();
        default:
            return text;
    }
};

function capitalize(m, p1, p2) {
    if (m.length > 0) {
        return p1 + p2.toUpperCase();
    }
}

module.exports = TextContainer;

},{"./nodecontainer":22}],36:[function(_dereq_,module,exports){
/* global SPECIFICITY: true */

exports.smallImage = function smallImage() {
    return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
};

exports.bind = function(callback, context) {
    return function() {
        return callback.apply(context, arguments);
    };
};

/*
 * base64-arraybuffer
 * https://github.com/niklasvh/base64-arraybuffer
 *
 * Copyright (c) 2012 Niklas von Hertzen
 * Licensed under the MIT license.
 */

exports.decode64 = function(base64) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var len = base64.length, i, encoded1, encoded2, encoded3, encoded4, byte1, byte2, byte3;

    var output = "";

    for (i = 0; i < len; i+=4) {
        encoded1 = chars.indexOf(base64[i]);
        encoded2 = chars.indexOf(base64[i+1]);
        encoded3 = chars.indexOf(base64[i+2]);
        encoded4 = chars.indexOf(base64[i+3]);

        byte1 = (encoded1 << 2) | (encoded2 >> 4);
        byte2 = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        byte3 = ((encoded3 & 3) << 6) | encoded4;
        if (encoded3 === 64) {
            output += String.fromCharCode(byte1);
        } else if (encoded4 === 64 || encoded4 === -1) {
            output += String.fromCharCode(byte1, byte2);
        } else{
            output += String.fromCharCode(byte1, byte2, byte3);
        }
    }

    return output;
};

exports.getBounds = function(node) {
    if (node.getBoundingClientRect) {
        var clientRect = node.getBoundingClientRect();
        var width = node.offsetWidth == null ? clientRect.width : node.offsetWidth;
        return {
            top: clientRect.top,
            bottom: clientRect.bottom || (clientRect.top + clientRect.height),
            right: clientRect.left + width,
            left: clientRect.left,
            width:  width,
            height: node.offsetHeight == null ? clientRect.height : node.offsetHeight
        };
    }
    return {};
};

exports.offsetBounds = function(node) {
    var parent = node.offsetParent ? exports.offsetBounds(node.offsetParent) : {top: 0, left: 0};

    return {
        top: node.offsetTop + parent.top,
        bottom: node.offsetTop + node.offsetHeight + parent.top,
        right: node.offsetLeft + parent.left + node.offsetWidth,
        left: node.offsetLeft + parent.left,
        width: node.offsetWidth,
        height: node.offsetHeight
    };
};

exports.parseBackgrounds = function(backgroundImage) {
    var whitespace = ' \r\n\t',
        method, definition, prefix, prefix_i, block, results = [],
        mode = 0, numParen = 0, quote, args;
    var appendResult = function() {
        if(method) {
            if (definition.substr(0, 1) === '"') {
                definition = definition.substr(1, definition.length - 2);
            }
            if (definition) {
                args.push(definition);
            }
            if (method.substr(0, 1) === '-' && (prefix_i = method.indexOf('-', 1 ) + 1) > 0) {
                prefix = method.substr(0, prefix_i);
                method = method.substr(prefix_i);
            }
            results.push({
                prefix: prefix,
                method: method.toLowerCase(),
                value: block,
                args: args,
                image: null
            });
        }
        args = [];
        method = prefix = definition = block = '';
    };
    args = [];
    method = prefix = definition = block = '';
    backgroundImage.split("").forEach(function(c) {
        if (mode === 0 && whitespace.indexOf(c) > -1) {
            return;
        }
        switch(c) {
        case '"':
            if(!quote) {
                quote = c;
            } else if(quote === c) {
                quote = null;
            }
            break;
        case '(':
            if(quote) {
                break;
            } else if(mode === 0) {
                mode = 1;
                block += c;
                return;
            } else {
                numParen++;
            }
            break;
        case ')':
            if (quote) {
                break;
            } else if(mode === 1) {
                if(numParen === 0) {
                    mode = 0;
                    block += c;
                    appendResult();
                    return;
                } else {
                    numParen--;
                }
            }
            break;

        case ',':
            if (quote) {
                break;
            } else if(mode === 0) {
                appendResult();
                return;
            } else if (mode === 1) {
                if (numParen === 0 && !method.match(/^url$/i)) {
                    args.push(definition);
                    definition = '';
                    block += c;
                    return;
                }
            }
            break;
        }

        block += c;
        if (mode === 0) {
            method += c;
        } else {
            definition += c;
        }
    });

    appendResult();
    return results;
};

exports.parseShadow = function(str) {
    var propertyFilters = { color: /^(#|rgb|hsl|(?!(inset|initial|inherit))[^\d\-\.]+)/i, inset: /^inset/i, px: /px$/i };
    var pxPropertyNames = [ 'x', 'y', 'blur', 'spread' ];
    var properties = str.split(/ (?![^(]*\))/);
    var info = {};
    for (var key in propertyFilters) {
        info[key] = properties.filter(propertyFilters[key].test.bind(propertyFilters[key]));
        info[key] = info[key].length === 0 ? null : info[key].length === 1 ? info[key][0] : info[key];
    }
    for (var i=0; i<info.px.length; i++) {
        info[pxPropertyNames[i]] = parseInt(info.px[i]);
    }
    return info;
};

exports.matrixInverse = function(m) {
    // This is programmed specifically for transform matrices, which have a fixed structure.
    // [ a b | c ]   [ a0 a2 | a4 ]
    // [ d e | f ] = [ a1 a3 | a5 ]
    var a = m[0], b = m[2], c = m[4], d = m[1], e = m[3], f = m[5];
    var detInv = 1 / (a*e - b*d);
    return [e*detInv, -d*detInv, -b*detInv, a*detInv, (b*f-c*e)*detInv, (c*d-a*f)*detInv];
};

function getShapeBounds(shape) {
    var len = shape.length;
    if (len === 1 && shape[0][0] === 'rect') {
        return {
            left: shape[0][1],
            top: shape[0][2],
            right: shape[0][1] + shape[0][3],
            bottom: shape[0][2] + shape[0][4],
            width: shape[0][3],
            height: shape[0][4]
        };
    }

    var xmin = Infinity;
    var ymin = Infinity;
    var xmax = -Infinity;
    var ymax = -Infinity;

    for (var i = 0; i < len; i++) {
        var s = shape[i];
        var x = s[s.length - 2];
        var y = s[s.length - 1];

        if (typeof x === 'number') {
            xmin = Math.min(xmin, x);
            ymin = Math.min(ymin, y);
            xmax = Math.max(xmax, x);
            ymax = Math.max(ymax, y);
        } else {
            var bounds = getShapeBounds(s);
            xmin = Math.min(xmin, bounds.left);
            ymin = Math.min(ymin, bounds.top);
            xmax = Math.max(xmax, bounds.right);
            ymax = Math.max(ymax, bounds.bottom);
        }
    }

    return {
        left: xmin,
        top: ymin,
        right: xmax,
        bottom: ymax,
        width: xmax - xmin,
        height: ymax - ymin
    };
}

exports.getShapeBounds = getShapeBounds;


var REGEX_PSEUDO_ELEMENTS = /::?(?:after|before|first-line|first-letter)/;

exports.getMatchingRules = function(element, selectorRegex) {
    var matchingRules = [];

    var getMatchingRulesRecursive = function(rules) {
        if (!rules) {
            return;
        }

        var len = rules.length;
        for (var i = 0; i < len; i++) {
            var rule = rules[i];
            switch (rule.type) {
            case 1: // CSSRule.STYLE_RULE
                try {
                    if (element.matches(rule.selectorText.replace(/::?[a-zA-Z\-]+/g, '')) && (!selectorRegex || selectorRegex.test(rule.selectorText))) {
                        matchingRules.push(rule);
                    }
                } catch (e) {
                    // ignore
                }
                break;

            case 3:  // CSSRule.IMPORT_RULE
                getMatchingRulesRecursive(rule.styleSheet.cssRules);
                break;

            case 4:  // CSSRule.MEDIA_RULE
            case 12: // CSSRule.SUPPORTS_RULE
            case 13: // CSSRule.DOCUMENT_RULE
                getMatchingRulesRecursive(rule.cssRules);
                break;            
            }
        }
    };

    var lenStyleSheets = element.ownerDocument.styleSheets.length;
    for (var i = 0; i < lenStyleSheets; i++) {
        try {
            var styleSheet = element.ownerDocument.styleSheets[i];
            if (styleSheet && styleSheet.cssRules) {
                getMatchingRulesRecursive(styleSheet.cssRules);
            }
        } catch (e) {
            // ignore
        }
    }

    var calculateSpecificity = function(rule) {
        var s = SPECIFICITY.calculate(rule.selectorText);
        var len = s.length;

        if (len === 1) {
            return s[0].specificityArray;
        }

        var arr = [];
        for (var i = 0; i < len; i++) {
            if (element.matches(s[i].selector.replace(REGEX_PSEUDO_ELEMENTS, ''))) {
                arr.push(s[i].specificityArray);
            }
        }

        arr.sort(SPECIFICITY.compare);
        return arr[arr.length - 1];
    };

    matchingRules.sort(function(a, b) {
        if (a.specificity === undefined) {
            a.specificity = calculateSpecificity(a);
        }
        if (b.specificity === undefined) {
            b.specificity = calculateSpecificity(b);
        }

        return SPECIFICITY.compare(a.specificity, b.specificity);
    });

    return matchingRules;
};

},{}],37:[function(_dereq_,module,exports){
function VideoContainer(imageData) {
  this.src = imageData.args[0].src;

  // Adding index to identify the video element as <video> can have multiple child <source>.
  this.videoIndex = imageData.videoIndex;
  imageData.args[0].videoIndex = imageData.videoIndex;
  this.image = imageData.args[0];
  this.promise = new Promise(function (resolve, reject){
    imageData.args[0].muted = true;
    var originalVideos = document.getElementsByTagName('video');
    if (originalVideos.length !== 0 && originalVideos[imageData.videoIndex]) {
      var originalVideo = originalVideos[imageData.videoIndex];
      if (originalVideo.currentTime) {
        imageData.args[0].currentTime = originalVideo.currentTime;
      }
      if (!imageData.args[0].paused) {
        resolve();
      } else {
        var playPromise = imageData.args[0].play();
        if (playPromise) {
          playPromise.then(resolve, reject);
        } else {
          resolve();
        }
      }
    } else {
      resolve();
    }
  });
}

module.exports = VideoContainer;

},{}],38:[function(_dereq_,module,exports){
var GradientContainer = _dereq_('./gradientcontainer');

function WebkitGradientContainer(imageData) {
    GradientContainer.apply(this, arguments);
    this.type = imageData.args[0] === "linear" ? GradientContainer.TYPES.LINEAR : GradientContainer.TYPES.RADIAL;
}

WebkitGradientContainer.prototype = Object.create(GradientContainer.prototype);

module.exports = WebkitGradientContainer;

},{"./gradientcontainer":17}],39:[function(_dereq_,module,exports){
function XHR(url) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);

        xhr.onload = function() {
            if (xhr.status === 200) {
                resolve(xhr.responseText);
            } else {
                reject(new Error(xhr.statusText));
            }
        };

        xhr.onerror = function() {
            reject(new Error("Network Error"));
        };

        xhr.send();
    });
}

module.exports = XHR;

},{}]},{},[12])(12)
});