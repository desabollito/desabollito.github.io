var afipsServices = angular.module('afipServices', ['app.services']);

afipsServices.factory('Afip', ['baseDataService',
	function (baseDataService) {
	    return baseDataService.getService('api/site', false, {
	        ValidarPersona: { method: 'POST', url: 'api/site/validarPersona' },
	        ValidarPersonaCliente: { method: 'GET', url: 'https://soa.afip.gob.ar/sr-padron/v1/persona/:numeroDocumento', params: { numeroDocumento: '@numeroDocumento' } }
	    });
	}]);
