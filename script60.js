var sitesServices = angular.module('siteServices', ['app.services']);

sitesServices.factory('SITE', ['baseDataService',
    function (baseDataService) {
        return baseDataService.getService('api/site', false, {
            obtenerPresupuestoYMediosDePago: { method: 'POST', url: 'api/site/ObtenerPresupuestoYMediosDePago' },
            enviarCodigoEmail: { method: 'POST', url: 'api/site/enviarCodigoEmail' },
            enviarCodigoEmailMandatario: { method: 'POST', url: 'api/site/enviarCodigoEmailMandatario' },
            finalizar: { method: 'POST', url: 'api/site/finalizar' },
            cancelarTurno: { method: 'POST', url: 'api/site/cancelarTurno' },
            modificarTurno: { method: 'POST', url: 'api/site/modificarTurno' },
            obtenerTurnos: { method: 'POST', url: 'api/site/obtenerTurnos' },
            identificarTramite: { method: 'POST', url: 'api/site/identificarTramite' },
            obtenerTiposTramitesParaTurnos: { method: 'POST', url: 'api/site/obtenerTiposTramitesParaTurnos' },
            obtenerTipoTramite: { method: 'GET', url: 'api/site/obtenerTiposTramitesParaTurnos/:esMandatario/:codigoTramite', params: { esMandatario: '@esMandatario',  codigoTramite: '@codigoTramite' }  },
            obtenerTiposTramitesParaAsociacionesProfesionales: { method: 'POST', url: 'api/site/obtenerTiposTramitesParaAsociacionesProfesionales' },
            validarPrecargaYObtenerTurnos: { method: 'POST', url: 'api/site/validarPrecargaYObtenerTurnos' },
            validarPrecarga: { method: 'POST', url: 'api/site/validarPrecarga' },
            validarPago: { method: 'POST', url: 'api/site/validarPago' },
            obtenerSolicitante: { method: 'GET', url: 'api/site/obtenerSolicitante/:cuit/:mandatario', params: { cuit: '@cuit', mandatario: '@mandatario', operacion: '@operacion' } },
            obtenerSolicitanteAsociado: { method: 'GET', url: 'api/site/obtenerSolicitanteAsociado/:cuit', params: { cuit: '@cuit' } },
            obtenerConcesionario: { method: 'GET', url: 'api/site/obtenerConcesionario/:cuit', params: { cuit: '@cuit' } },
            obtenerAcreedorPrendario: { method: 'GET', url: 'api/site/ObtenerAcreedorPrendario/:cuit', params: { cuit: '@cuit' } },
            iniciarEPagos: { method: 'POST', url: 'api/site/epagos' },
            epagosHabilitado: { method: 'GET', url: 'api/site/epagos-habilitado/:rs', params: { rs: '@rs' } }
        });
    }]);