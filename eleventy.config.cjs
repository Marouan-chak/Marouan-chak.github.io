module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("CNAME");
  eleventyConfig.addPassthroughCopy("index.html");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy("site.webmanifest");
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("favicon.svg");
  eleventyConfig.addPassthroughCopy("favicon-16x16.png");
  eleventyConfig.addPassthroughCopy("favicon-32x32.png");
  eleventyConfig.addPassthroughCopy("apple-touch-icon.png");
  eleventyConfig.addPassthroughCopy("Marouan_Chakran_Resume.pdf");

  eleventyConfig.addPassthroughCopy({ "blog/assets": "blog/assets" });
  eleventyConfig.addPassthroughCopy({
    "crossplane-python-blog-posts/images": "blog/crossplane-python-blog-posts/images",
  });

  eleventyConfig.addFilter("readableDate", (dateObj) => {
    const date = new Date(dateObj);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });

  eleventyConfig.addFilter("dateIso", (dateObj) => {
    const date = new Date(dateObj);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString();
    }
    return date.toISOString();
  });

  eleventyConfig.addFilter("rssDate", (dateObj) => {
    const date = new Date(dateObj);
    return date.toUTCString();
  });

  eleventyConfig.addFilter("findIndexByUrl", (items, url) => {
    if (!Array.isArray(items)) return -1;
    return items.findIndex((item) => item.url === url);
  });

  eleventyConfig.addCollection("crossplanePythonSeries", (collectionApi) => {
    return collectionApi
      .getFilteredByTag("crossplane-python-blog-posts")
      .sort((a, b) => (a.data.part || 0) - (b.data.part || 0));
  });

  return {
    templateFormats: ["md", "njk", "html", "liquid", "11ty.js", "xml"],
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    markdownTemplateEngine: false,
  };
};
