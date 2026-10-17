// screenpipe — AI that knows everything you have seen, said, or heard
// https://screenpipe.com
// Test-only private API declarations from Chromium, BSD-3-Clause.
// https://chromium.googlesource.com/chromium/src/+/HEAD/ui/display/mac/test/virtual_display_util_mac.mm
#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
@interface CGVirtualDisplay : NSObject

@property(readonly, nonatomic) unsigned int vendorID;
@property(readonly, nonatomic) unsigned int productID;
@property(readonly, nonatomic) unsigned int serialNum;
@property(readonly, nonatomic) NSString* name;
@property(readonly, nonatomic) struct CGSize sizeInMillimeters;
@property(readonly, nonatomic) unsigned int maxPixelsWide;
@property(readonly, nonatomic) unsigned int maxPixelsHigh;
@property(readonly, nonatomic) struct CGPoint redPrimary;
@property(readonly, nonatomic) struct CGPoint greenPrimary;
@property(readonly, nonatomic) struct CGPoint bluePrimary;
@property(readonly, nonatomic) struct CGPoint whitePoint;
@property(readonly, nonatomic) id queue;
@property(readonly, nonatomic) id terminationHandler;
@property(readonly, nonatomic) unsigned int displayID;
@property(readonly, nonatomic) unsigned int hiDPI;
@property(readonly, nonatomic) NSArray* modes;
@property(readonly, nonatomic) unsigned int serialNumber;
@property(readonly, nonatomic) unsigned int rotation;
- (BOOL)applySettings:(id)arg1;
- (void)dealloc;
- (id)initWithDescriptor:(id)arg1;

@end

// These interfaces were generated from CoreGraphics binaries.
@interface CGVirtualDisplayDescriptor : NSObject

@property(nonatomic) unsigned int vendorID;
@property(nonatomic) unsigned int productID;
@property(nonatomic) unsigned int serialNum;
@property(strong, nonatomic) NSString* name;
@property(nonatomic) struct CGSize sizeInMillimeters;
@property(nonatomic) unsigned int maxPixelsWide;
@property(nonatomic) unsigned int maxPixelsHigh;
@property(nonatomic) struct CGPoint redPrimary;
@property(nonatomic) struct CGPoint greenPrimary;
@property(nonatomic) struct CGPoint bluePrimary;
@property(nonatomic) struct CGPoint whitePoint;
@property(strong, nonatomic) id queue;
@property(copy, nonatomic) id terminationHandler;
@property(nonatomic) unsigned int serialNumber;
- (void)dealloc;
- (id)init;
- (id)dispatchQueue;
- (void)setDispatchQueue:(id)arg1;

@end

// These interfaces were generated from CoreGraphics binaries.
@interface CGVirtualDisplayMode : NSObject

@property(readonly, nonatomic) unsigned int width;
@property(readonly, nonatomic) unsigned int height;
@property(readonly, nonatomic) double refreshRate;
@property(copy, nonatomic) id transferFunction API_AVAILABLE(macos(13.3));
- (id)initWithWidth:(unsigned int)arg1
             height:(unsigned int)arg2
        refreshRate:(double)arg3;
- (id)initWithWidth:(unsigned int)arg1
              height:(unsigned int)arg2
         refreshRate:(double)arg3
    transferFunction:(id)arg4 API_AVAILABLE(macos(13.3));

@end

// These interfaces were generated from CoreGraphics binaries.
@interface CGVirtualDisplaySettings : NSObject

@property(strong, nonatomic) NSArray* modes;
@property(nonatomic) unsigned int hiDPI;
@property(nonatomic) unsigned int rotation;
- (void)dealloc;
- (id)init;

@end

// Copyright 2022 The Chromium Authors (private API declarations above).
// BSD-3-Clause: https://chromium.googlesource.com/chromium/src/+/HEAD/LICENSE
static CGVirtualDisplay *extra;
static NSMutableDictionary<NSNumber *, NSWindow *> *markers;
static unsigned serial;
// Close the marker before unplug: WindowServer otherwise relocates the blue
// window onto the primary, contaminating its real capture during teardown.
static void removeDisplay(void) {
    if (extra) {
        NSNumber *key = @(extra.displayID);
        [markers[key] close];
        [markers removeObjectForKey:key];
        extra = nil;
    }
}
static void setMode(BOOL retina) {
    CGVirtualDisplaySettings *settings = [CGVirtualDisplaySettings new];
    settings.hiDPI = retina;
    settings.modes = @[[[CGVirtualDisplayMode alloc] initWithWidth:1280 height:720 refreshRate:60]];
    if (![extra applySettings:settings]) exit(3);
}
static void addDisplay(BOOL retina) {
    CGVirtualDisplayDescriptor *d = [CGVirtualDisplayDescriptor new];
    d.name = @"Screenpipe disposable acceptance display";
    d.vendorID = 505; d.productID = 1; d.serialNum = ++serial; d.serialNumber = serial;
    d.maxPixelsWide = 2560; d.maxPixelsHigh = 1440;
    d.sizeInMillimeters = CGSizeMake(340, 190);
    d.whitePoint = CGPointMake(0.3125,0.3291);
    d.redPrimary = CGPointMake(0.64,0.33); d.greenPrimary = CGPointMake(0.3,0.6); d.bluePrimary = CGPointMake(0.15,0.06);
    d.queue = dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0);
    extra = [[CGVirtualDisplay alloc] initWithDescriptor:d];
    if (!extra) { fprintf(stderr,"virtual display creation failed\n"); exit(2); }
    setMode(retina);
}
static void settle(void) {
    NSDate *end=[NSDate dateWithTimeIntervalSinceNow:2.0];
    while ([end timeIntervalSinceNow]>0) [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
}
static void report(void) {
    CGDirectDisplayID ids[16]; uint32_t count=0;
    CGGetOnlineDisplayList(16,ids,&count);
    NSMutableArray *items=[NSMutableArray new];
    if (!markers) markers=[NSMutableDictionary new];
    NSMutableSet *live=[NSMutableSet new];
    CGFloat mainHeight=CGDisplayBounds(CGMainDisplayID()).size.height;
    for (uint32_t i=0;i<count;i++) {
        CGRect r=CGDisplayBounds(ids[i]);
        NSNumber *key=@(ids[i]);[live addObject:key];
        NSWindow *marker=markers[key];
        if(!marker) {
            marker=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,200,200) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
            marker.level=NSFloatingWindowLevel;marker.ignoresMouseEvents=YES;marker.releasedWhenClosed=NO;
            marker.backgroundColor=CGDisplayIsMain(ids[i]) ? [NSColor colorWithRed:0.9 green:0.1 blue:0.1 alpha:1] : [NSColor colorWithRed:0.1 green:0.1 blue:0.9 alpha:1];
            markers[key]=marker;
        }
        [marker setFrame:NSMakeRect(r.origin.x+20,mainHeight-r.origin.y-220,200,200) display:YES];[marker orderFrontRegardless];
        CGDisplayModeRef mode=CGDisplayCopyDisplayMode(ids[i]);
        [items addObject:@{@"id":@(ids[i]),@"x":@(r.origin.x),@"y":@(r.origin.y),@"w":@(r.size.width),@"h":@(r.size.height),@"mode_w":@(CGDisplayModeGetWidth(mode)),@"mode_h":@(CGDisplayModeGetHeight(mode)),@"pixels_w":@(CGDisplayModeGetPixelWidth(mode)),@"pixels_h":@(CGDisplayModeGetPixelHeight(mode)),@"main":@(CGDisplayIsMain(ids[i])),@"mirror":@(CGDisplayMirrorsDisplay(ids[i]))}];
        CGDisplayModeRelease(mode);
    }
    for(NSNumber *key in [markers.allKeys copy]) if(![live containsObject:key]) { [markers[key] close];[markers removeObjectForKey:key]; }
    CGEventRef ev=CGEventCreate(NULL); CGPoint p=CGEventGetLocation(ev); CFRelease(ev);
    NSData *json=[NSJSONSerialization dataWithJSONObject:@{@"displays":items,@"extra":@(extra ? extra.displayID:0),@"cursor_x":@(p.x),@"cursor_y":@(p.y)} options:0 error:nil];
    fwrite(json.bytes,1,json.length,stdout);puts("");fflush(stdout);
}
static int placeWindow(pid_t pid,double x,double y) {
    CGDirectDisplayID target=0;uint32_t targets=0;
    CGGetDisplaysWithPoint(CGPointMake(x,y),1,&target,&targets);
    if(targets!=1 || !CGRectContainsRect(CGDisplayBounds(target),CGRectMake(x,y,600,400))) return 22;
    AXUIElementRef app=AXUIElementCreateApplication(pid);AXUIElementSetMessagingTimeout(app,0.3);CFTypeRef raw=NULL;
    AXError e=AXUIElementCopyAttributeValue(app,kAXFocusedWindowAttribute,&raw);
    if(e || !raw) { CFRelease(app);return 20; }
    CGPoint position=CGPointMake(x,y);CGSize size=CGSizeMake(600,400);
    AXValueRef pos=AXValueCreate((AXValueType)kAXValueCGPointType,&position), dim=AXValueCreate((AXValueType)kAXValueCGSizeType,&size);
    AXUIElementSetAttributeValue((AXUIElementRef)raw,kAXSizeAttribute,dim);
    e=AXUIElementSetAttributeValue((AXUIElementRef)raw,kAXPositionAttribute,pos);
    CFRelease(pos);CFRelease(dim);CFRelease(raw);CFRelease(app);
    if(!e) printf("%u\n",target);
    return e ? 21 : 0;
}
int main(int argc,char **argv) { @autoreleasepool {
    const char *opt=getenv("SCREENPIPE_ISOLATED_VM_TEST");
    if (!opt || strcmp(opt,"1")!=0) return 10;
    serial = arc4random_uniform(UINT32_MAX - 100) + 1;
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    if(argc==2 && strcmp(argv[1],"--list-only")==0) {
        CGDirectDisplayID ids[16];uint32_t count=0;CGGetOnlineDisplayList(16,ids,&count);
        printf("{\"count\":%u}\n",count);return 0;
    }
    if(argc==5 && strcmp(argv[1],"place-window")==0) return placeWindow(atoi(argv[2]),atof(argv[3]),atof(argv[4]));
    if(argc==4 && strcmp(argv[1],"warp-to")==0) return CGWarpMouseCursorPosition(CGPointMake(atof(argv[2]),atof(argv[3])));
    addDisplay(NO); settle(); report();
    char *line=NULL; size_t length=0;
    while (getline(&line,&length,stdin)>0) { @autoreleasepool {
        double x=0,y=0;
        if (sscanf(line,"layout %lf %lf",&x,&y)==2) {
            CGDisplayConfigRef cfg; CGBeginDisplayConfiguration(&cfg);
            CGConfigureDisplayOrigin(cfg,extra.displayID,(int32_t)x,(int32_t)y);
            CGError e=CGCompleteDisplayConfiguration(cfg,kCGConfigureForSession);
            if(e) fprintf(stderr,"layout error %d\n",e);
        } else if(sscanf(line,"warp %lf %lf",&x,&y)==2) {
            CGError e=CGWarpMouseCursorPosition(CGPointMake(x,y));
            if(e) fprintf(stderr,"warp error %d\n",e);
        } else if(strncmp(line,"mode-retina",11)==0) { setMode(YES);
        } else if(strncmp(line,"mode-standard",13)==0) { setMode(NO);
        } else if(strncmp(line,"remove",6)==0) { removeDisplay();
        } else if(strncmp(line,"add-retina",10)==0) { removeDisplay();settle();addDisplay(YES);
        } else if(strncmp(line,"add",3)==0) { removeDisplay();settle();addDisplay(NO);
        } else if(strncmp(line,"quit",4)==0) { break; }
        settle();report();
    }}
    free(line);removeDisplay();return 0;
}}
