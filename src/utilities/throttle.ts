export class Throttle {
  public static throttle(callback, limit: number) {
    var waiting: boolean = false;
    return function () {
      if (!waiting) {
        callback.apply(this, arguments);
        waiting = true;
        setTimeout(function () {
          waiting = false;
        }, limit);
      }
    };
  }
}
