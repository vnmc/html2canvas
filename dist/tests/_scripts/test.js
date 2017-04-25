document.write('<script type="text/javascript" src="_scripts/jquery-3.2.1.min.js"></script>');
document.write('<script type="text/javascript" src="_scripts/bluebird.js"></script>');
document.write('<script type="text/javascript" src="../specificity.js"></script>');
document.write('<script type="text/javascript" src="../html2canvas.js"></script>');
document.write('<script type="text/javascript" src="../fabric.js"></script>');

setTimeout(function()
{
	$(document).ready(function()
	{
		if (window.setUp)
	        window.setUp();
	});	
}, 100);

setTimeout(function()
{
	html2canvas(
		document.documentElement,
		{
			background: '#ffffff',
			type: 'view',
			letterRendering: true,
			javascriptEnabled: true,
			proxy: 'areion'
		}
	).then(function(canvas)
	{
		var len = document.body.childNodes.length;
		for (var i = 0; i < len; i++)
		{
			var node = document.body.childNodes[i];
			if (node.nodeType === 1)
				node.style.display = 'none';
		}

		canvas.style.position = 'absolute';
		canvas.style.left = '0';
		canvas.style.top = '0';
		canvas.style.padding = '0';
		canvas.style.opacity = '1';

		document.body.append(canvas);
	});
}, 2000);
