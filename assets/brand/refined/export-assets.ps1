Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.IO;
public static class DailyBrandExport {
  static int Clamp(double n) { return (int)Math.Max(0, Math.Min(255, Math.Round(n))); }
  static Bitmap Mask(string path, bool white) {
    using (var src = new Bitmap(path)) {
      var dst = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
      for (int y=0;y<src.Height;y++) for (int x=0;x<src.Width;x++) {
        var c=src.GetPixel(x,y);
        double lum=.2126*c.R+.7152*c.G+.0722*c.B;
        int a=white ? Clamp((lum-25)*255/215) : Clamp((225-lum)*255/205);
        dst.SetPixel(x,y,Color.FromArgb(a,255,255,255));
      }
      return dst;
    }
  }
  static Rectangle Bounds(Bitmap b) {
    int l=b.Width,t=b.Height,r=0,d=0;
    for(int y=0;y<b.Height;y++) for(int x=0;x<b.Width;x++) if(b.GetPixel(x,y).A>8) {
      l=Math.Min(l,x);t=Math.Min(t,y);r=Math.Max(r,x);d=Math.Max(d,y);
    }
    return Rectangle.FromLTRB(l,t,r+1,d+1);
  }
  static void Quality(Graphics g) {
    g.InterpolationMode=InterpolationMode.HighQualityBicubic;
    g.PixelOffsetMode=PixelOffsetMode.HighQuality;
    g.CompositingQuality=CompositingQuality.HighQuality;
  }
  public static void Run(string dir) {
    using(var mask=Mask(Path.Combine(dir,"daily-wordmark-source-opaque.png"),false)) {
      var box=Bounds(mask); int pad=12;
      foreach(string name in new[]{"light","dark","mask"}) {
        using(var dst=new Bitmap(box.Width+pad*2,box.Height+pad*2,PixelFormat.Format32bppArgb)) {
          int ink=name=="dark"?255:0;
          for(int y=0;y<box.Height;y++) for(int x=0;x<box.Width;x++)
            dst.SetPixel(x+pad,y+pad,Color.FromArgb(mask.GetPixel(x+box.X,y+box.Y).A,ink,ink,ink));
          dst.Save(Path.Combine(dir,"daily-wordmark-"+name+".png"),ImageFormat.Png);
        }
      }
      Console.WriteLine("Wordmarks: "+(box.Width+pad*2)+" x "+(box.Height+pad*2));
    }
    using(var mask=Mask(Path.Combine(dir,"daily-app-icon-master.png"),true)) {
      var box=Bounds(mask);
      using(var cropped=mask.Clone(box,PixelFormat.Format32bppArgb)) {
        foreach(int size in new[]{1024,512,192,180}) using(var dst=new Bitmap(size,size,PixelFormat.Format32bppArgb)) {
          using(var g=Graphics.FromImage(dst)) {
            Quality(g);g.Clear(Color.FromArgb(16,16,18));
            float w=size*.68f,h=w*box.Height/box.Width;
            g.DrawImage(cropped,new RectangleF((size-w)/2,(size-h)/2,w,h));
          }
          dst.Save(Path.Combine(dir,"daily-app-icon-"+size+".png"),ImageFormat.Png);
        }
      }
    }
    using(var preview=new Bitmap(1200,700)) using(var g=Graphics.FromImage(preview)) {
      Quality(g);g.Clear(Color.FromArgb(242,242,247));
      g.FillRectangle(new SolidBrush(Color.FromArgb(16,16,18)),600,0,600,420);
      using(var font=new Font("Arial",14)) {
        g.DrawString("LIGHT / system accent",font,Brushes.Black,30,24);
        g.DrawString("DARK / system accent",font,Brushes.White,630,24);
        foreach(string name in new[]{"light","dark"}) using(var logo=new Bitmap(Path.Combine(dir,"daily-wordmark-"+name+".png"))) {
          int x=name=="light"?30:630;
          g.DrawImage(logo,new RectangleF(x,85,530,530f*logo.Height/logo.Width));
          g.DrawString("Header at 22 px height",font,name=="light"?Brushes.Black:Brushes.White,x,240);
          g.DrawImage(logo,new RectangleF(x,280,22f*logo.Width/logo.Height,22));
          using(var tint=new Bitmap(logo.Width,logo.Height)) {
            for(int y=0;y<logo.Height;y++) for(int xx=0;xx<logo.Width;xx++)
              tint.SetPixel(xx,y,Color.FromArgb(logo.GetPixel(xx,y).A,name=="light"?0:111,name=="light"?114:176,name=="light"?234:255));
            g.DrawImage(tint,new RectangleF(x,340,320,320f*logo.Height/logo.Width));
          }
        }
        g.DrawString("Static app icon / actual pixel sizes: 192, 64, 32",font,Brushes.Black,30,438);
        using(var icon=new Bitmap(Path.Combine(dir,"daily-app-icon-192.png"))) {
          g.DrawImage(icon,new Rectangle(30,470,192,192));
          g.DrawImage(icon,new Rectangle(235,500,64,64));
          g.DrawImage(icon,new Rectangle(340,516,32,32));
        }
      }
      preview.Save(Path.Combine(dir,"preview.png"),ImageFormat.Png);
    }
  }
}
'@
[DailyBrandExport]::Run($PSScriptRoot)
