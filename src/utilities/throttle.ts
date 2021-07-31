module.exports = throttle;

function throttle(func, wait): Function {
  var ctx, args, rtn, timeoutID;
  var last = 0;

  return function throttled() {
    ctx = this;
    args = arguments;
    var delta: number = Date.now() - last;
    if (!timeoutID)
      if (delta >= wait) call();
      else timeoutID = setTimeout(call, wait - delta);
    return rtn;
  };

  function call() {
    timeoutID = 0;
    last = +new Date();
    rtn = func.apply(ctx, args);
    ctx = null;
    args = null;
  }
}
