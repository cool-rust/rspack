use napi_derive::napi;
use rspack_core::{ChunkGroup, ChunkGroupUkey, Compilation};

use crate::{JsChunk, JsCompilation};

#[napi(object)]
pub struct JsChunkGroup {
  #[napi(js_name = "__inner_parents")]
  pub inner_parents: Vec<u32>,
  pub chunks: Vec<JsChunk>,
  pub index: Option<u32>,
  pub name: Option<String>,
}

impl JsChunkGroup {
  pub fn from_chunk_group(
    cg: &rspack_core::ChunkGroup,
    compilation: &rspack_core::Compilation,
  ) -> Self {
    Self {
      chunks: cg
        .chunks
        .iter()
        .map(|k| {
          JsChunk::from(
            compilation.chunk_by_ukey.get(k).unwrap_or_else(|| {
              panic!("Could not find Chunk({k:?}) belong to ChunkGroup: {cg:?}",)
            }),
          )
        })
        .collect(),
      index: cg.index,
      inner_parents: cg
        .parents
        .iter()
        .map(|ukey| ukey.as_usize() as u32)
        .collect(),
      name: cg.name().map(|name| name.to_string()),
    }
  }
}

fn chunk_group(ukey: u32, compilation: &Compilation) -> &ChunkGroup {
  let ukey = ChunkGroupUkey::from(ukey as usize);
  compilation
    .chunk_group_by_ukey
    .get(&ukey)
    .expect("chunk group should exists")
}

#[napi(js_name = "__chunk_group_inner_get_chunk_group")]
pub fn get_chunk_group(ukey: u32, compilation: &JsCompilation) -> JsChunkGroup {
  let compilation = &compilation.inner;
  let cg = chunk_group(ukey, compilation);
  JsChunkGroup::from_chunk_group(cg, compilation)
}
