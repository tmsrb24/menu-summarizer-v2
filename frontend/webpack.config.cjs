const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, '..', 'public', 'dist'),
    filename: 'bundle.js',
    publicPath: '/dist/'
  },
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: '../index.html'
    })
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, '..', 'public'),
    },
    proxy: [
      {
        context: ['/summarize'],
        target: 'http://localhost:3001',
      },
    ],
    compress: true,
    port: 3000,
    hot: true
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },
};
