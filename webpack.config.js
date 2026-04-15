const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// Parse .env file manually without relying on dotenv
const envVars = {};
try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = match[2] || '';
        if (val.length > 0 && val.charAt(0) === '"' && val.charAt(val.length-1) === '"') {
          val = val.replace(/^"|"$/g, '');
        } else if (val.length > 0 && val.charAt(0) === "'" && val.charAt(val.length-1) === "'") {
          val = val.replace(/^'|'$/g, '');
        }
        envVars[`process.env.${match[1]}`] = JSON.stringify(val);
      }
    });
  }
} catch(e) {}


module.exports = {
  entry: {
    popup: './src/popup/index.tsx',
    background: './src/background/index.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx']
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/popup.html',
      filename: 'popup.html',
      chunks: ['popup']
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: './public/manifest.json', to: 'manifest.json' },
        { from: './public/icons', to: 'icons' }
      ]
    }),
    new webpack.DefinePlugin({
      ...envVars
    })
  ],
  mode: 'development',
  devtool: 'cheap-module-source-map'
};
