#import <Cocoa/Cocoa.h>
#import <dlfcn.h>

// Optional private API: resolve at runtime so unsupported systems fail cleanly.
@interface NSTouchBarItem (TetrisTray)
+ (void)addSystemTrayItem:(NSTouchBarItem *)item;
+ (void)removeSystemTrayItem:(NSTouchBarItem *)item;
@end
@interface NSTouchBar (TetrisModal)
+ (void)presentSystemModalTouchBar:(NSTouchBar *)bar placement:(long long)placement systemTrayItemIdentifier:(NSString *)identifier;
+ (void)dismissSystemModalTouchBar:(NSTouchBar *)bar;
@end
// Three transparent Codex expressions: default, thinking, completed.
@interface SessionButton : NSButton
@property NSInteger avatar;
@property NSString *activity;
@property NSString *provider;
@end
@implementation SessionButton
- (void)drawRect:(NSRect)dirtyRect {
  BOOL working = [self.activity isEqualToString:@"working"];
  NSColor *accent = working ? [NSColor systemBlueColor] : [self.activity isEqualToString:@"done"] ? [NSColor systemGreenColor] : [self.activity isEqualToString:@"attention"] ? [NSColor systemOrangeColor] : [NSColor secondaryLabelColor];
  [[NSColor colorWithWhite:self.highlighted ? 0.24 : 0.10 alpha:1] setFill];
  [[NSBezierPath bezierPathWithRoundedRect:self.bounds xRadius:6 yRadius:6] fill];
  static NSMutableDictionary *sheets;
  if (!sheets) sheets = [NSMutableDictionary new];
  NSString *sprite = [self.provider isEqualToString:@"Claude Code"] ? @"claude-code" : @"codex";
  NSImage *sheet = sheets[sprite];
  if (!sheet) { sheet = [[NSImage alloc] initWithContentsOfFile:[[NSBundle mainBundle] pathForResource:sprite ofType:@"png"]] ?: [NSImage new]; sheets[sprite] = sheet; }
  NSInteger index = [self.activity isEqualToString:@"done"] ? 2 : working || [self.activity isEqualToString:@"attention"] ? 1 : 0;
  CGFloat cellWidth = sheet.size.width / 3;
  NSRect source = NSMakeRect(index * cellWidth, 0, cellWidth, sheet.size.height);
  [sheet drawInRect:NSMakeRect(5,(self.bounds.size.height-28)/2,28,28) fromRect:source operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
  NSMutableParagraphStyle *paragraph = [NSMutableParagraphStyle new];
  paragraph.lineBreakMode = NSLineBreakByTruncatingMiddle;
  paragraph.alignment = NSTextAlignmentCenter;
  NSDictionary *attributes = @{NSFontAttributeName:[NSFont systemFontOfSize:12 weight:NSFontWeightMedium], NSForegroundColorAttributeName:[NSColor whiteColor], NSParagraphStyleAttributeName:paragraph};
  // Fixed outer columns keep every tile aligned regardless of directory length.
  const CGFloat textLeft = 38;
  const CGFloat statusColumn = 28;
  CGFloat available = MAX(0, self.bounds.size.width - textLeft - statusColumn);
  CGFloat textHeight = [@"Ag" sizeWithAttributes:attributes].height;
  [self.title drawInRect:NSMakeRect(textLeft,(self.bounds.size.height-textHeight)/2,available,textHeight) withAttributes:attributes];
  CGFloat x = self.bounds.size.width - statusColumn / 2;
  NSPoint center = NSMakePoint(x,self.bounds.size.height/2);
  [accent setStroke]; [accent setFill];
  if (working) {
    CGFloat angle = fmod([NSDate timeIntervalSinceReferenceDate]*240,360);
    NSBezierPath *arc = [NSBezierPath bezierPath]; arc.lineWidth = 2;
    [arc appendBezierPathWithArcWithCenter:center radius:4 startAngle:angle endAngle:angle+270]; [arc stroke];
  } else {
    NSString *symbol = [self.activity isEqualToString:@"done"] ? @"✓" : [self.activity isEqualToString:@"attention"] ? @"!" : @"·";
    NSDictionary *symbolAttributes = @{NSFontAttributeName:[NSFont boldSystemFontOfSize:13],NSForegroundColorAttributeName:accent};
    NSSize symbolSize = [symbol sizeWithAttributes:symbolAttributes];
    [symbol drawAtPoint:NSMakePoint(x-symbolSize.width/2,center.y-symbolSize.height/2) withAttributes:symbolAttributes];
  }
}
@end
static NSString * const identifier = @"com.collaborator.codex.status";
static void (*setPresence)(NSString *, BOOL);
@interface Delegate : NSObject <NSApplicationDelegate>
@property NSCustomTouchBarItem *item;
@property NSButton *button;
@property NSTouchBar *bar;
@property NSStackView *stack;
@property NSButton *quota;
@property NSPanel *island;
@property NSStackView *islandStack;
@property BOOL islandEnabled;
@property NSInteger islandPage;
@property NSTimer *animationTimer;
@property NSArray *entries;
@property NSInteger page;
@property BOOL presented;
@property BOOL suppressed;
@property BOOL requested;
@end
@interface Delegate (Layout)
- (void)applyState:(NSDictionary *)state;
@end
@interface Delegate ()
@end
@implementation Delegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  void *framework = dlopen("/System/Library/PrivateFrameworks/DFRFoundation.framework/DFRFoundation", RTLD_LAZY);
  setPresence = framework ? dlsym(framework, "DFRElementSetControlStripPresenceForIdentifier") : NULL;

  self.item = [[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
  self.button = [NSButton buttonWithTitle:@"Codex" target:self action:@selector(open:)];
  self.item.view = self.button;
  if (setPresence && [NSTouchBarItem respondsToSelector:@selector(addSystemTrayItem:)]) {
    [NSTouchBarItem addSystemTrayItem:self.item]; setPresence(identifier, NO);
  }
  self.animationTimer = [NSTimer scheduledTimerWithTimeInterval:0.1 repeats:YES block:^(NSTimer *timer) {
    NSArray *views = [(self.presented ? self.stack.arrangedSubviews : @[]) arrayByAddingObjectsFromArray:(self.islandEnabled ? self.islandStack.arrangedSubviews : @[])];
    for (NSView *view in views) {
      if ([view isKindOfClass:[SessionButton class]] && [((SessionButton *)view).activity isEqualToString:@"working"]) view.needsDisplay = YES;
    }
  }];
  puts("ready"); fflush(stdout);
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    char *line = NULL; size_t size = 0;
    while (getline(&line, &size, stdin) != -1) {
      NSData *data = [[NSString stringWithUTF8String:line] dataUsingEncoding:NSUTF8StringEncoding];
      NSDictionary *state = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
      if (![state isKindOfClass:[NSDictionary class]]) continue;
      dispatch_async(dispatch_get_main_queue(), ^{
        NSString *title = state[@"title"];
        if ([title isKindOfClass:[NSString class]]) self.button.title = title;
        [self applyState:state];
      });
    }
    free(line);
    dispatch_async(dispatch_get_main_queue(), ^{ [NSApp terminate:nil]; });
  });
}
- (void)open:(id)sender {
  if (self.requested) { self.suppressed = NO; [self showFull]; }
  else { puts("open"); fflush(stdout); }
}
- (void)select:(NSButton *)sender { printf("open:%ld\n", (long)sender.tag); fflush(stdout); }
- (void)refreshAgents:(id)sender { puts("refresh"); fflush(stdout); }
- (void)closeFull:(id)sender {
  self.suppressed = YES;
  if (self.presented) [NSTouchBar dismissSystemModalTouchBar:self.bar];
  self.presented = NO;
}
- (void)nextPage:(id)sender { self.page++; [self rebuild]; }
- (void)rebuild {
  NSInteger pages = MAX(1, (self.entries.count + 4) / 5);
  self.page = self.page % pages;
  for (NSView *view in self.stack.arrangedSubviews.copy) { [self.stack removeArrangedSubview:view]; [view removeFromSuperview]; }
  NSInteger start = self.page * 5;
  for (NSInteger i = start; i < MIN(start + 5, self.entries.count); i++) {
    NSDictionary *entry = self.entries[i];
    SessionButton *button = [[SessionButton alloc] initWithFrame:NSMakeRect(0,0,150,30)];
    button.title = entry[@"title"] ?: @"Codex";
    button.avatar = [entry[@"avatar"] integerValue];
    button.provider = entry[@"provider"];
    button.activity = entry[@"activity"] ?: @"unknown";
    button.target = self; button.action = @selector(select:);
    button.tag = [entry[@"pid"] integerValue];
    [button.heightAnchor constraintEqualToConstant:30].active = YES;
    [button setAccessibilityLabel:[NSString stringWithFormat:@"%@, %@",button.title,button.activity]];
    [self.stack addArrangedSubview:button];
  }
  if (!self.entries.count) [self.stack addArrangedSubview:[NSButton buttonWithTitle:@"暂无 Agent" target:nil action:nil]];
  if (pages > 1) [self.stack addArrangedSubview:[NSButton buttonWithTitle:[NSString stringWithFormat:@"%ld/%ld ›", self.page+1, pages] target:self action:@selector(nextPage:)]];
}
- (void)showFull {
  if (self.presented || self.suppressed) return;
  if (![NSTouchBar respondsToSelector:@selector(presentSystemModalTouchBar:placement:systemTrayItemIdentifier:)] ||
      ![NSTouchBar respondsToSelector:@selector(dismissSystemModalTouchBar:)]) { puts("unsupported-full-width"); fflush(stdout); return; }
  if (!self.bar) {
    self.bar = [NSTouchBar new];
    NSCustomTouchBarItem *content = [[NSCustomTouchBarItem alloc] initWithIdentifier:@"codex.sessions"];
    self.stack = [NSStackView new];
    self.stack.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    self.stack.distribution = NSStackViewDistributionFillEqually;
    self.stack.spacing = 6;
    // Prefer the full available strip; the low-priority width can shrink for Escape.
    NSLayoutConstraint *width = [self.stack.widthAnchor constraintEqualToConstant:1085];
    width.priority = NSLayoutPriorityDefaultLow; width.active = YES;
    content.view = self.stack;
    NSCustomTouchBarItem *refresh = [[NSCustomTouchBarItem alloc] initWithIdentifier:@"codex.refresh"];
    NSButton *refreshButton = [NSButton buttonWithTitle:@"↻" target:self action:@selector(refreshAgents:)];
    [refreshButton setAccessibilityLabel:@"刷新 Agent 状态"];
    refresh.view = refreshButton;
    [refresh.view.widthAnchor constraintEqualToConstant:32].active = YES;
    NSCustomTouchBarItem *close = [[NSCustomTouchBarItem alloc] initWithIdentifier:@"codex.close"];
    close.view = [NSButton buttonWithTitle:@"×" target:self action:@selector(closeFull:)];
    NSCustomTouchBarItem *quota = [[NSCustomTouchBarItem alloc] initWithIdentifier:@"codex.quota"];
    self.quota = [NSButton buttonWithTitle:@"Weekly —" target:nil action:nil];
    self.quota.font = [NSFont monospacedDigitSystemFontOfSize:12 weight:NSFontWeightMedium];
    [self.quota.widthAnchor constraintEqualToConstant:112].active = YES;
    quota.view = self.quota;
    [close.view.widthAnchor constraintEqualToConstant:32].active = YES;
    self.bar.templateItems = [NSSet setWithArray:@[content, quota, refresh, close]];
    self.bar.defaultItemIdentifiers = @[@"codex.sessions", @"codex.quota", @"codex.refresh", @"codex.close"];
    self.bar.principalItemIdentifier = @"codex.sessions";
  }
  [self rebuild];
  [NSTouchBar presentSystemModalTouchBar:self.bar placement:1 systemTrayItemIdentifier:identifier];
  self.presented = YES;
}
- (void)updateIsland {
  if (!self.islandEnabled) { [self.island orderOut:nil]; return; }
  if (!self.island) {
    self.island = [[NSPanel alloc] initWithContentRect:NSMakeRect(0,0,560,64) styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel backing:NSBackingStoreBuffered defer:NO];
    self.island.level = NSFloatingWindowLevel;
    self.island.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;
    self.island.opaque = NO; self.island.backgroundColor = NSColor.clearColor;
    self.island.hasShadow = YES;
    NSView *root = self.island.contentView; root.wantsLayer = YES;
    root.layer.backgroundColor = NSColor.blackColor.CGColor; root.layer.cornerRadius = 22;
    self.islandStack = [NSStackView new]; self.islandStack.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    self.islandStack.distribution = NSStackViewDistributionFillEqually; self.islandStack.spacing = 6;
    self.islandStack.translatesAutoresizingMaskIntoConstraints = NO; [root addSubview:self.islandStack];
    [NSLayoutConstraint activateConstraints:@[[self.islandStack.leadingAnchor constraintEqualToAnchor:root.leadingAnchor constant:12],[self.islandStack.trailingAnchor constraintEqualToAnchor:root.trailingAnchor constant:-12],[self.islandStack.centerYAnchor constraintEqualToAnchor:root.centerYAnchor],[self.islandStack.heightAnchor constraintEqualToConstant:34]]];
  }
  NSScreen *screen = NSScreen.screens.firstObject;
  if (screen) [self.island setFrameOrigin:NSMakePoint(NSMidX(screen.frame)-280,NSMaxY(screen.visibleFrame)-72)];
  for (NSView *view in self.islandStack.arrangedSubviews.copy) { [self.islandStack removeArrangedSubview:view]; [view removeFromSuperview]; }
  NSInteger pages = MAX(1,(self.entries.count+2)/3); self.islandPage %= pages;
  for (NSInteger i=self.islandPage*3; i<MIN(self.islandPage*3+3,self.entries.count); i++) {
    NSDictionary *entry = self.entries[i];
    SessionButton *button = [SessionButton new]; button.title=entry[@"title"] ?: @"Codex";
    button.avatar=[entry[@"avatar"] integerValue]; button.activity=entry[@"activity"];
    button.tag=[entry[@"pid"] integerValue]; button.target=self; button.action=@selector(select:);
    [button setAccessibilityLabel:[NSString stringWithFormat:@"%@ %@",button.title,button.activity]];
    [self.islandStack addArrangedSubview:button];
  }
  if (!self.entries.count) [self.islandStack addArrangedSubview:[NSTextField labelWithString:@"Agent · 暂无会话"]];
  if (pages>1) [self.islandStack addArrangedSubview:[NSButton buttonWithTitle:@"›" target:self action:@selector(nextIsland:)]];
  [self.island orderFrontRegardless];
}
- (void)nextIsland:(id)sender { self.islandPage++; [self updateIsland]; }
- (void)applyState:(NSDictionary *)state {
  self.islandEnabled = [state[@"island"] boolValue];
  if (setPresence) setPresence(identifier,[state[@"touchEnabled"] boolValue]);
  NSArray *entries = state[@"entries"];
  if ([entries isKindOfClass:[NSArray class]]) {
    BOOL changed = ![self.entries isEqual:entries];
    self.entries = entries;
    if (changed && self.stack) [self rebuild];
  }
  [self updateIsland];
  self.requested = [state[@"fullWidth"] boolValue];
  if (self.requested) [self showFull];
  else {
    if (self.presented) [NSTouchBar dismissSystemModalTouchBar:self.bar];
    self.presented = NO; self.suppressed = NO;
  }
  if ([state[@"quota"] isKindOfClass:[NSString class]]) self.quota.title = state[@"quota"];
}
- (void)applicationWillTerminate:(NSNotification *)notification {
  if (self.presented) [NSTouchBar dismissSystemModalTouchBar:self.bar];
  [self.animationTimer invalidate];
  if (setPresence) setPresence(identifier, NO);
  if (self.item && [NSTouchBarItem respondsToSelector:@selector(removeSystemTrayItem:)]) [NSTouchBarItem removeSystemTrayItem:self.item];
  [self.island close];
}
@end
int main(void) {
  @autoreleasepool {
    NSApplication *app = [NSApplication sharedApplication];
    [app setActivationPolicy:NSApplicationActivationPolicyAccessory];
    Delegate *delegate = [Delegate new]; app.delegate = delegate;
    [app run];
  }
  return 0;
}
