import {DailyError} from './domain.mjs';

export function firebaseStore(db){
  return {
    async transaction(uid,fn){
      if(typeof uid!=='string'||!uid||/[.#$\[\]\/]/.test(uid))throw new DailyError('UNAUTHENTICATED','Invalid authenticated account.');
      let output,problem;
      try{
        const result=await db.ref('users/'+uid).transaction(current=>{
          // Firebase may first invoke with an empty local cache. Returning null requests
          // a server compare/retry without inventing an account or rewriting another user.
          if(current===null){output=undefined;return null;}
          try{const next=fn(current);output=next.result;problem=null;return next.root;}
          catch(e){problem=e;return undefined;}
        },undefined,false);
        if(problem)throw problem;
        if(!result.committed||output===undefined)throw new DailyError('ACCOUNT_UNAVAILABLE','Daily account data is unavailable. No confirmed change.');
        return output; // Only the server-acknowledged transaction can return success.
      }catch(e){
        if(e instanceof DailyError)throw e;
        throw new DailyError('OUTCOME_UNKNOWN','The cloud outcome is unknown. Retrieve the same request ID before retrying.');
      }
    }
  };
}
