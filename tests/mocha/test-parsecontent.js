require('should');
var NodeParser = require('../../src/nodeparser.js');

NodeParser.parsePseudoContent('counter(x)');


describe('NodeParser.parsePseudoContent', function() {
    it('should parse string', function() {
        NodeParser.parsePseudoContent('"hello"').should.eql([
            { type: 'string', value: 'hello' }
        ]);
    });

    it('should parse string with (,)', function() {
        NodeParser.parsePseudoContent('"a,b (c) d"').should.eql([
            { type: 'string', value: 'a,b (c) d' }
        ]);
    });

    it('should parse string with escaped quotes', function() {
        NodeParser.parsePseudoContent('"3.14\\""').should.eql([
            { type: 'string', value: '3.14"' }
        ]);
    });

    it('should parse string with escape', function() {
        NodeParser.parsePseudoContent('"a\\) \\\\ b"').should.eql([
            { type: 'string', value: 'a) \\ b' }
        ]);
    });

    it('should parse two strings', function() {
        NodeParser.parsePseudoContent('"hello" \'world\'').should.eql([
            { type: 'string', value: 'hello' },
            { type: 'string', value: 'world' }
        ]);
    });

    it('should parse counter', function() {
        NodeParser.parsePseudoContent('counter(x)').should.eql([
            { type: 'counter', name: 'x' }
        ]);
    });

    it('should parse counters', function() {
        NodeParser.parsePseudoContent('counters(x, "-")').should.eql([
            { type: 'counters', name: 'x', glue: '-' }
        ]);
    });

    it('should parse strings and counters', function() {
        NodeParser.parsePseudoContent('"["counters(c2, " < ") \']\'').should.eql([
            { type: 'string', value: '[' },
            { type: 'counters', name: 'c2', glue: ' < ' },
            { type: 'string', value: ']' }
        ]);
    });

    it('should parse counter with format', function() {
        NodeParser.parsePseudoContent('counter(x, lower-greek)').should.eql([
            { type: 'counter', name: 'x', format: 'lower-greek' }
        ]);
    });

    it('should parse counters with format', function() {
        NodeParser.parsePseudoContent('counters(x, "-", upper-roman)').should.eql([
            { type: 'counters', name: 'x', glue: '-', format: 'upper-roman' }
        ]);
    });

    it('should parse strings and counters with format', function() {
        NodeParser.parsePseudoContent('"["counters(c2, \' < \', disc) \']\'').should.eql([
            { type: 'string', value: '[' },
            { type: 'counters', name: 'c2', glue: ' < ', format: 'disc' },
            { type: 'string', value: ']' }
        ]);
    });

    it('should parse attr', function() {
        NodeParser.parsePseudoContent('attr(id)').should.eql([
            { type: 'attr', attr: 'id' }
        ]);
    });

    it('should parse url', function() {
        NodeParser.parsePseudoContent('url(http://www.abc.ch/d/e.png)').should.eql([
            { type: 'url', href: 'http://www.abc.ch/d/e.png' }
        ]);
    });
});
