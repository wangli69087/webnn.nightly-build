import glob
import json
import os
import sys
import tarfile


def main(args):
  if len(args) != 3:
    print 'usage: python make_tar.py <out_dir> tar_<os>.json <output>.tgz'
    return 1
  (outDir, cfgJson, outputFile) = args
  os.chdir(outDir)

  files = set()

  with open(cfgJson) as rf:
    config = json.load(rf)
    for key, valueList in config.items():
        for value in valueList:
          for item in glob.glob(value):
            files.add(item)

  with tarfile.open(outputFile, "w:gz") as archive:
    for f in sorted(files):
      archive.add(f)


if __name__ == '__main__':
  sys.exit(main(sys.argv[1:]))
