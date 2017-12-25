const getOptions = require('./options')
const Metalsmith = require('metalsmith')
const Handlebars = require('handlebars')
const render = require('consolidate').handlebars.render
const multimatch = require('multimatch')
const filter = require('./filter')
const ask = require('./ask')
const path = require('path')
const async = require('async')

/**
 * 根据模板构建项目
 *
 * @param {String} name 项目名称
 * @param {String} src 本地模板地址 
 * @param {String} dest 生成项目目标地址 
 * @param {String} done 回调函数 
 */
module.exports = function generate (name, src, dest, done) {
	const opts = getOptions(name, src)
	const metalsmith = Metalsmith(path.join(src, 'template'))
  const data = Object.assign(metalsmith.metadata(), {
    destDirName: name,
    inPlace: false,
    noEscape: true
	})
	
	metalsmith.use(askQuestions(opts.prompts))
	.use(filterFiles(opts.filters))
	.use(renderTemplateFiles(opts.skipInterpolation))

	metalsmith.clean(false)
	.source('.') // start from template root instead of `./src` which is Metalsmith's default for `source`
	.destination(dest)
	.build((err, files) => {
		done(err)
		if (typeof opts.complete === 'function') {
			const helpers = { chalk, logger, files }
			opts.complete(data, helpers)
		}
		// else {
		// 	console.log(opts.completeMessage)
		// }
	})

	return data
}

/**
 * Create a middleware for asking questions.
 *
 * @param {Object} prompts
 * @return {Function}
 */

function askQuestions (prompts) {
  return (files, metalsmith, done) => {
    ask(prompts, metalsmith.metadata(), done)
  }
}

/**
 * Create a middleware for filtering files.
 *
 * @param {Object} filters
 * @return {Function}
 */

function filterFiles (filters) {
  return (files, metalsmith, done) => {
    filter(files, filters, metalsmith.metadata(), done)
  }
}

/**
 * Template in place plugin.
 *
 * @param {Object} files
 * @param {Metalsmith} metalsmith
 * @param {Function} done
 */
function renderTemplateFiles (skipInterpolation) {
  skipInterpolation = typeof skipInterpolation === 'string'
    ? [skipInterpolation]
    : skipInterpolation
  return (files, metalsmith, done) => {
    const keys = Object.keys(files)
    const metalsmithMetadata = metalsmith.metadata()
    async.each(keys, (file, next) => {
      // skipping files with skipInterpolation option
      if (skipInterpolation && multimatch([file], skipInterpolation, { dot: true }).length) {
        return next()
      }
      const str = files[file].contents.toString()
      // do not attempt to render files that do not have mustaches
      if (!/{{([^{}]+)}}/g.test(str)) {
        return next()
      }
      render(str, metalsmithMetadata, (err, res) => {
        if (err) {
          err.message = `[${file}] ${err.message}`
          return next(err)
        }
        files[file].contents = new Buffer(res)
        next()
      })
    }, done)
  }
}