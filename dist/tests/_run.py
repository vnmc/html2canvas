import sys
import os
import time
from selenium import webdriver
from scipy.misc import imread
import numpy


def set_viewport_size(driver, width, height):
    window_size = driver.execute_script("""
        return [window.outerWidth - window.innerWidth + arguments[0],
          window.outerHeight - window.innerHeight + arguments[1]];
        """, width, height)
    driver.set_window_size(*window_size)

def process_file(browser, f):
	browser.get('http://localhost:8005/tests/' + f)

	time.sleep(1)
	browser.save_screenshot('s.png')

	time.sleep(2)
	browser.save_screenshot('t.png')

	img1 = imread('s.png')
	img2 = imread('t.png')
	print f, numpy.count_nonzero(img1 - img2) / float(img1.size)


#browser = webdriver.Safari()
browser = webdriver.Chrome()
set_viewport_size(browser, 1200, 800)

if (len(sys.argv) > 1):
	for f in os.listdir('.'):
		if (sys.argv[1] in f):
			process_file(browser, f)
else:
	for f in os.listdir('.'):
		if (f[0] != '.' and f[0] != '_' and f.endswith('.html')):
			process_file(browser, f)

browser.quit()
