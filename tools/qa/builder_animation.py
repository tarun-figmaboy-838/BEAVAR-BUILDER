"""Exercise the raster operator's pose priority, controls, idle blink, and reduced motion."""
import os
import sys
import time
from cdp import start_static_server, launch_chrome, connect_page

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/beaver-operator-qa'
os.makedirs(OUT, exist_ok=True)
server = start_static_server(ROOT, 8794)
chrome = None
try:
    chrome = launch_chrome(9335, os.path.join(OUT, 'profile'))
    page = connect_page(9335)
    page.navigate('http://127.0.0.1:8794/?vo=0')
    page.wait_for("!document.getElementById('loader')", timeout=30)
    page.pump(2)
    page.evaluate("""(async () => {
      const { createBuilderCharacter } = await import('./js/gameplay/builder-character.js');
      document.querySelector('#crane .builder').style.display = 'none';
      document.getElementById('overlays').innerHTML = '';
      window.operator = createBuilderCharacter({ hostEl: document.getElementById('crane') });
      operator.show();
    })()""")
    def state():
        return page.evaluate("({...operator.element.dataset})", await_promise=False)
    def check(condition, message):
        if not condition:
            raise AssertionError(message + ': ' + str(state()))
        print('ok ', message, flush=True)
    check(state()['pose'] == 'idle' and state()['facing'] == 'controls', 'initial seated idle faces controls')
    page.screenshot(os.path.join(OUT, 'idle.png'))
    page.wait_for("operator.element.dataset.frame === '2'", timeout=6)
    check(state()['facing'] == 'controls', 'idle blinks without turning toward player')
    page.evaluate("operator.setAxis({x: -1,y: 0})")
    check(state()['pose'] == 'drive' and state()['frame'] == '1' and state()['sheet'] == '4', 'left input uses side-console pose')
    page.screenshot(os.path.join(OUT, 'drive-left.png'))
    page.evaluate("operator.setAxis({x: 1,y: 0})")
    check(state()['frame'] == '3', 'right input changes grip')
    page.evaluate("operator.setAxis({x: 0,y: -1})")
    check(state()['frame'] == '2', 'up input changes grip')
    page.evaluate("operator.setAxis({x: 0,y: 0}); operator.setGameState({craneState:'grabbing',completed:false})")
    check(state()['pose'] == 'pick', 'pick follows crane state')
    page.evaluate("operator.setGameState({craneState:'carrying',completed:false})")
    check(state()['pose'] == 'carry', 'carrying uses steady operator pose')
    page.evaluate("operator.setGameState({craneState:'dropping',completed:false})")
    check(state()['pose'] == 'drop', 'drop releases the lever')
    page.evaluate("operator.talkUntil(new Promise(r => window.finishSpeech = r)); undefined")
    page.pump(.3)
    check(state()['pose'] == 'talk' and state()['facing'] == 'user', 'speech faces the player')
    page.screenshot(os.path.join(OUT, 'talk.png'))
    page.evaluate("operator.cheer(); finishSpeech(); undefined")
    page.pump(.4)
    check(state()['pose'] == 'cheer', 'old speech cannot cancel a newer reaction')
    page.screenshot(os.path.join(OUT, 'happy.png'))
    page.evaluate("operator.setGameState({craneState:'idle',completed:false}); operator.worry()")
    page.pump(.6)
    check(state()['pose'] == 'worry', 'mistake shows gentle disappointment')
    page.screenshot(os.path.join(OUT, 'sad.png'))
    page.pump(1.7)
    check(state()['pose'] == 'idle' and state()['facing'] == 'controls', 'reaction returns to controls-facing idle')
    page.evaluate("operator.setGameState({craneState:'locked',completed:true})")
    check(state()['pose'] == 'complete', 'completion has its own celebration')
    page.screenshot(os.path.join(OUT, 'complete.png'))
    page.send('Emulation.setEmulatedMedia', {'features':[{'name':'prefers-reduced-motion','value':'reduce'}]})
    page.evaluate("operator.setPose('talk')")
    first = state()['frame']
    page.pump(.6)
    check(state()['frame'] == first, 'reduced motion stops frame loops')
    page.evaluate("operator.hide()")
    page.pump(.3)
    check(page.evaluate('operator.element.hidden', await_promise=False), 'hidden operator stays stopped')
    check(not page.errors, 'no browser exceptions')
finally:
    if chrome:
        chrome.terminate()
    server.terminate()
