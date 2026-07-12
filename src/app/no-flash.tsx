/**
 * Inline script injected before hydration to set the theme (dark class) and
 * language (lang/dir) from localStorage — prevents a flash of the wrong theme
 * or wrong text direction on first paint.
 */
export function NoFlashScript() {
  const code = `(function(){try{
    var t=localStorage.getItem('bc-theme');
    if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
    var r=document.documentElement;
    if(t==='dark'){r.classList.add('dark');}
    r.style.colorScheme=t;
    var l=localStorage.getItem('bc-locale');
    var locales=['ar','en','fr'];
    if(locales.indexOf(l)===-1){l='ar';}
    r.setAttribute('lang',l);
    r.setAttribute('dir', l==='ar'?'rtl':'ltr');
  }catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
