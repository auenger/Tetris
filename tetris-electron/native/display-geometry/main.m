#import <Cocoa/Cocoa.h>

// Public AppKit geometry, in logical points. No accessibility or camera access.
int main(void) {
  @autoreleasepool {
    NSMutableArray *displays = [NSMutableArray array];
    for (NSScreen *screen in NSScreen.screens) {
      if (@available(macOS 12.0, *)) {
        CGFloat height = screen.safeAreaInsets.top;
        NSRect left = screen.auxiliaryTopLeftArea;
        NSRect right = screen.auxiliaryTopRightArea;
        CGFloat width = NSMinX(right) - NSMaxX(left);
        if (height > 0 && width > 0 && left.size.width > 0 && right.size.width > 0) {
          [displays addObject:@{
            @"displayId": screen.deviceDescription[@"NSScreenNumber"],
            @"x": @(NSMaxX(left) - NSMinX(screen.frame)),
            @"width": @(width), @"height": @(height)
          }];
        }
      }
    }
    NSData *json = [NSJSONSerialization dataWithJSONObject:displays options:0 error:nil];
    if (!json) return 1;
    fwrite(json.bytes, 1, json.length, stdout);
    fputc('\n', stdout);
  }
  return 0;
}
